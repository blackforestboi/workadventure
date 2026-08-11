import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";
import {
    VisualAssetAnimation,
    type VisualAssetAnimation as VisualAssetAnimationValue,
} from "@workadventure/map-editor";

import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import type { TeapotDataRepository } from "./TeapotDataRepository";
import type { TeapotAssetRecord, TeapotJsonValue } from "./TeapotRecords";
import type { TeapotAuthorizationService } from "./TeapotAuthorizationService";
import type { TeapotIdentityService } from "./TeapotIdentityService";
import { resolveTeapotOwnerIdentity, TEAPOT_WORKADVENTURE_IDENTITY_PROVIDER } from "./TeapotOwnerIdentityResolver";
import { validateTeapotTilesetPng } from "./TeapotTilesetPngValidator";
import type { TeapotWokaObjectStore } from "./TeapotWokaObjectStore";
import { TeapotWokaValidationError } from "./TeapotWokaPngValidator";

const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_NAME_LENGTH = 80;

export interface TeapotTilesetView {
    id: string;
    name: string;
    url: string;
    width: number;
    height: number;
    columns: number;
    rows: number;
    animation?: VisualAssetAnimationValue;
    createdAt: string;
}

export interface TeapotTilesetRaster {
    bytes: Buffer;
    etag: string;
}

export class TeapotTilesetService {
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
        provenance?: TeapotJsonValue,
        animation?: VisualAssetAnimationValue,
    ) {
        const name = requestedName.trim();
        if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
            throw new TeapotWokaValidationError(`Tileset name must be between 1 and ${MAX_NAME_LENGTH} characters`);
        }
        const validated = validateTeapotTilesetPng(bytes);
        if (
            animation !== undefined &&
            (animation.frameWidth !== 32 ||
                animation.frameHeight !== 32 ||
                animation.frameCount !== validated.columns ||
                validated.rows !== 1)
        ) {
            throw new TeapotWokaValidationError("Terrain animation metadata must match the 32px tileset grid");
        }
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.create");
        const objectReference = await this.objectStore.put(validated.bytes);
        try {
            const accepted = await this.repository.acceptCatalogAsset({
                ownerId: owner.id,
                objectReference,
                kind: "tileset",
                mediaType: "image/png",
                published: true,
                catalogName: "Browser Tilesets",
                metadata: {
                    name,
                    sha256: validated.sha256,
                    width: validated.width,
                    height: validated.height,
                    columns: validated.columns,
                    rows: validated.rows,
                    tileWidth: 32,
                    tileHeight: 32,
                    ...(animation === undefined ? {} : { animation }),
                    ...(provenance === undefined ? {} : { provenance }),
                },
            });
            return this.toView(accepted.asset);
        } catch (error: unknown) {
            try {
                await this.objectStore.delete(objectReference);
            } catch (cleanupError: unknown) {
                Sentry.captureException(asError(cleanupError));
            }
            throw error;
        }
    }

    async list(providerSubject: string): Promise<{ items: TeapotTilesetView[] }> {
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.manage-own");
        return { items: (await this.repository.listAssets(owner.id, "tileset")).map((asset) => this.toView(asset)) };
    }

    async getPublicRaster(assetId: string): Promise<TeapotTilesetRaster | null> {
        if (!ASSET_ID_PATTERN.test(assetId)) return null;
        const asset = await this.repository.getAsset(assetId);
        if (
            asset === null ||
            asset.kind !== "tileset" ||
            asset.mediaType !== "image/png" ||
            !asset.published ||
            asset.deletedAt !== null
        )
            return null;
        const bytes = await this.objectStore.get(asset.objectReference);
        return bytes === null ? null : { bytes, etag: readNumberOrString(asset.metadata, "sha256") ?? asset.id };
    }

    private async resolveOwner(providerSubject: string): Promise<TeapotIdentity> {
        return resolveTeapotOwnerIdentity(this.repository, this.identity, providerSubject, this.identityProvider);
    }

    private toView(asset: TeapotAssetRecord): TeapotTilesetView {
        return {
            id: asset.id,
            name: readNumberOrString(asset.metadata, "name") ?? "Tileset",
            url: `${this.publicPusherUrl}/teapot/tileset-assets/${encodeURIComponent(asset.id)}.png`,
            width: readNumber(asset.metadata, "width"),
            height: readNumber(asset.metadata, "height"),
            columns: readNumber(asset.metadata, "columns"),
            rows: readNumber(asset.metadata, "rows"),
            ...readAnimation(asset.metadata),
            createdAt: asset.createdAt,
        };
    }
}

function readAnimation(metadata: TeapotJsonValue): { animation?: VisualAssetAnimationValue } {
    const parsed = VisualAssetAnimation.safeParse(readMetadata(metadata, "animation"));
    return parsed.success ? { animation: parsed.data } : {};
}

function readNumber(metadata: TeapotJsonValue, key: string): number {
    const value = readMetadata(metadata, key);
    return typeof value === "number" ? value : 0;
}

function readNumberOrString(metadata: TeapotJsonValue, key: string): string | null {
    const value = readMetadata(metadata, key);
    return typeof value === "string" ? value : null;
}

function readMetadata(metadata: TeapotJsonValue, key: string): TeapotJsonValue | undefined {
    return typeof metadata === "object" && metadata !== null && !Array.isArray(metadata) ? metadata[key] : undefined;
}
