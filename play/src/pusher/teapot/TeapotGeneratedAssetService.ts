import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";

import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import {
    VisualAssetAnimation,
    type VisualAssetAnimation as VisualAssetAnimationValue,
} from "@workadventure/map-editor";
import type { TeapotAuthorizationService } from "./TeapotAuthorizationService";
import type { TeapotDataRepository } from "./TeapotDataRepository";
import { validateTeapotGeneratedPng } from "./TeapotGeneratedRasterValidator";
import type { TeapotAssetRecord, TeapotJsonValue } from "./TeapotRecords";
import type { TeapotIdentityService } from "./TeapotIdentityService";
import { resolveTeapotOwnerIdentity, TEAPOT_WORKADVENTURE_IDENTITY_PROVIDER } from "./TeapotOwnerIdentityResolver";
import type { TeapotWokaObjectStore } from "./TeapotWokaObjectStore";
import { TeapotWokaValidationError } from "./TeapotWokaPngValidator";

const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_NAME_LENGTH = 80;

export type TeapotGeneratedAssetKind = "map-entity" | "reference";

export interface TeapotGeneratedAssetView {
    id: string;
    name: string;
    url: string;
    kind: TeapotGeneratedAssetKind;
    width: number;
    height: number;
    animation?: VisualAssetAnimationValue;
    sha256: string;
    createdAt: string;
}

export class TeapotGeneratedAssetService {
    private readonly publicPusherUrl: string;

    constructor(
        private readonly repository: TeapotDataRepository,
        private readonly identity: TeapotIdentityService,
        private readonly authorization: TeapotAuthorizationService,
        private readonly objectStore: TeapotWokaObjectStore,
        publicPusherUrl = "",
        private readonly identityProvider = TEAPOT_WORKADVENTURE_IDENTITY_PROVIDER,
    ) {
        this.publicPusherUrl = publicPusherUrl.replace(/\/+$/, "");
    }

    async accept(
        providerSubject: string,
        requestedName: string,
        bytes: Buffer,
        kind: TeapotGeneratedAssetKind,
        provenance?: TeapotJsonValue,
        animation?: VisualAssetAnimationValue,
    ): Promise<TeapotGeneratedAssetView> {
        const name = requestedName.trim();
        if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
            throw new TeapotWokaValidationError(`Asset name must be between 1 and ${MAX_NAME_LENGTH} characters`);
        }
        const validated = validateTeapotGeneratedPng(bytes);
        if (
            animation !== undefined &&
            (validated.width !== animation.frameWidth * animation.frameCount ||
                validated.height !== animation.frameHeight)
        ) {
            throw new TeapotWokaValidationError("Animation metadata must match the horizontal frame strip");
        }
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.create");
        const existing = (await this.repository.listAssets(owner.id, kind)).find(
            (asset) => readString(asset.metadata, "sha256") === validated.sha256,
        );
        if (existing !== undefined) return this.toView(existing, kind);

        const objectReference = await this.objectStore.put(validated.bytes);
        try {
            const accepted = await this.repository.acceptCatalogAsset({
                ownerId: owner.id,
                objectReference,
                kind,
                mediaType: "image/png",
                // Generated reference outputs remain owner-private. Input reference images never reach this service.
                published: kind === "map-entity",
                catalogName: kind === "map-entity" ? "Generated map entities" : "Generated references",
                metadata: {
                    name,
                    sha256: validated.sha256,
                    width: validated.width,
                    height: validated.height,
                    byteLength: validated.bytes.byteLength,
                    ...(animation === undefined ? {} : { animation }),
                    ...(provenance === undefined ? {} : { provenance }),
                },
            });
            return this.toView(accepted.asset, kind);
        } catch (error: unknown) {
            try {
                await this.objectStore.delete(objectReference);
            } catch (cleanupError: unknown) {
                Sentry.captureException(asError(cleanupError));
            }
            throw error;
        }
    }

    async list(
        providerSubject: string,
        kind: TeapotGeneratedAssetKind,
    ): Promise<{ items: TeapotGeneratedAssetView[] }> {
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.manage-own");
        return { items: (await this.repository.listAssets(owner.id, kind)).map((asset) => this.toView(asset, kind)) };
    }

    async getPublicRaster(assetId: string): Promise<{ bytes: Buffer; etag: string } | null> {
        if (!ASSET_ID_PATTERN.test(assetId)) return null;
        const asset = await this.repository.getAsset(assetId);
        if (
            asset === null ||
            asset.kind !== "map-entity" ||
            asset.mediaType !== "image/png" ||
            !asset.published ||
            asset.deletedAt !== null
        ) {
            return null;
        }
        const bytes = await this.objectStore.get(asset.objectReference);
        return bytes === null ? null : { bytes, etag: readString(asset.metadata, "sha256") ?? asset.id };
    }

    async getOwnerRaster(providerSubject: string, assetId: string): Promise<{ bytes: Buffer; etag: string } | null> {
        if (!ASSET_ID_PATTERN.test(assetId)) return null;
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.manage-own");
        const asset = await this.repository.getAsset(assetId);
        if (
            asset === null ||
            asset.ownerId !== owner.id ||
            asset.kind !== "reference" ||
            asset.mediaType !== "image/png" ||
            asset.published ||
            asset.deletedAt !== null
        ) {
            return null;
        }
        const bytes = await this.objectStore.get(asset.objectReference);
        return bytes === null ? null : { bytes, etag: readString(asset.metadata, "sha256") ?? asset.id };
    }

    private async resolveOwner(providerSubject: string): Promise<TeapotIdentity> {
        return resolveTeapotOwnerIdentity(this.repository, this.identity, providerSubject, this.identityProvider);
    }

    private toView(asset: TeapotAssetRecord, kind: TeapotGeneratedAssetKind): TeapotGeneratedAssetView {
        return {
            id: asset.id,
            name: readString(asset.metadata, "name") ?? "Generated asset",
            url:
                kind === "map-entity"
                    ? `${this.publicPusherUrl}/teapot/generated-assets/${encodeURIComponent(asset.id)}.png`
                    : `${this.publicPusherUrl}/teapot/generated-assets/private/${encodeURIComponent(asset.id)}.png`,
            kind,
            width: readNumber(asset.metadata, "width"),
            height: readNumber(asset.metadata, "height"),
            ...readAnimation(asset.metadata),
            sha256: readSha256(asset.metadata),
            createdAt: asset.createdAt,
        };
    }
}

function readAnimation(metadata: TeapotJsonValue): { animation?: VisualAssetAnimationValue } {
    const value = readMetadata(metadata, "animation");
    const parsed = VisualAssetAnimation.safeParse(value);
    return parsed.success ? { animation: parsed.data } : {};
}

function readSha256(metadata: TeapotJsonValue): string {
    const sha256 = readString(metadata, "sha256");
    if (sha256 === null || !SHA256_PATTERN.test(sha256)) {
        throw new Error("Generated asset metadata contains an invalid SHA-256 fingerprint");
    }
    return sha256;
}

function readString(metadata: TeapotJsonValue, key: string): string | null {
    const value = readMetadata(metadata, key);
    return typeof value === "string" ? value : null;
}

function readNumber(metadata: TeapotJsonValue, key: string): number {
    const value = readMetadata(metadata, key);
    return typeof value === "number" ? value : 0;
}

function readMetadata(metadata: TeapotJsonValue, key: string): TeapotJsonValue | undefined {
    return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) ? metadata[key] : undefined;
}
