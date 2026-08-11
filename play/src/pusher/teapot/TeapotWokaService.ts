import type { WokaDetail, WokaTexture } from "@workadventure/messages";
import * as Sentry from "@sentry/node";
import { asError } from "catch-unknown";

import type { TeapotIdentity } from "../../common/Teapot/TeapotIdentity";
import { readTeapotWokaCategory, TEAPOT_WOKA_CATEGORIES } from "../../common/Teapot/TeapotWoka";
import type { TeapotWokaCategory } from "../../common/Teapot/TeapotWoka";
import { TeapotDataNotFoundError } from "./TeapotDataErrors";
import type { TeapotDataRepository } from "./TeapotDataRepository";
import type { TeapotAssetRecord, TeapotJsonValue } from "./TeapotRecords";
import type { TeapotWokaObjectStore } from "./TeapotWokaObjectStore";
import type { TeapotAuthorizationService } from "./TeapotAuthorizationService";
import type { TeapotIdentityService } from "./TeapotIdentityService";
import {
    resolveTeapotOwnerIdentity,
    TEAPOT_WORKADVENTURE_IDENTITY_PROVIDER,
} from "./TeapotOwnerIdentityResolver";
import { TeapotWokaValidationError, validateTeapotWokaPng } from "./TeapotWokaPngValidator";

const GENERATED_TEXTURE_PREFIX = "teapot-woka:";
const ASSET_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_WOKA_NAME_LENGTH = 80;

export interface TeapotWokaServiceOptions {
    publicPusherUrl?: string;
    identityProvider?: string;
}

export interface TeapotWokaView {
    id: string;
    name: string;
    url: string;
    category: TeapotWokaCategory;
    active: boolean;
    createdAt: string;
}

export interface TeapotWokaListView {
    items: TeapotWokaView[];
    activeTextureId: string | null;
}

export interface TeapotWokaRaster {
    bytes: Buffer;
    etag: string;
}

export class TeapotWokaService {
    private readonly publicPusherUrl: string;
    private readonly identityProvider: string;

    constructor(
        private readonly repository: TeapotDataRepository,
        private readonly identity: TeapotIdentityService,
        private readonly authorization: TeapotAuthorizationService,
        private readonly objectStore: TeapotWokaObjectStore,
        options: TeapotWokaServiceOptions = {},
    ) {
        this.publicPusherUrl = (options.publicPusherUrl ?? "").replace(/\/+$/, "");
        this.identityProvider = options.identityProvider ?? TEAPOT_WORKADVENTURE_IDENTITY_PROVIDER;
    }

    async accept(
        providerSubject: string,
        requestedName: string,
        bytes: Buffer,
        category: TeapotWokaCategory = "woka",
    ): Promise<TeapotWokaView> {
        const name = normalizeName(requestedName);
        const validated = validateTeapotWokaPng(bytes);
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.create");

        const objectReference = await this.objectStore.put(validated.bytes);
        try {
            const accepted = await this.repository.acceptWoka({
                ownerId: owner.id,
                objectReference,
                metadata: {
                    name,
                    category,
                    sha256: validated.sha256,
                    width: validated.width,
                    height: validated.height,
                    frameWidth: validated.frameWidth,
                    frameHeight: validated.frameHeight,
                    frameColumns: validated.frameColumns,
                    frameRows: validated.frameRows,
                    hasAlpha: true,
                },
            });
            const activeAssetId = accepted.selection?.assetId ?? (await this.getActiveWholeWokaAssetId(owner.id));
            return this.toView(accepted.asset, activeAssetId);
        } catch (error: unknown) {
            try {
                await this.objectStore.delete(objectReference);
            } catch (cleanupError: unknown) {
                const cleanupCause = asError(cleanupError);
                console.error("Failed to remove uncommitted generated Woka bytes", cleanupCause);
                Sentry.captureException(cleanupCause);
            }
            throw error;
        }
    }

    async list(providerSubject: string): Promise<TeapotWokaListView> {
        const owner = await this.resolveOwner(providerSubject);
        const [assets, selection] = await Promise.all([
            this.repository.listWokas(owner.id),
            this.repository.getActiveWokaSelection(owner.id),
        ]);
        const selectedAsset = assets.find((asset) => asset.id === selection?.assetId);
        const activeAssetId =
            selectedAsset !== undefined && readTeapotWokaCategory(selectedAsset.metadata) === "woka"
                ? selectedAsset.id
                : null;
        return {
            items: assets.map((asset) => this.toView(asset, activeAssetId)),
            activeTextureId: activeAssetId === null ? null : toGeneratedTextureId(activeAssetId),
        };
    }

    async select(providerSubject: string, textureId: string): Promise<TeapotWokaView> {
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.manage-own");
        const assetId = requireGeneratedAssetId(textureId);
        const asset = await this.repository.getAsset(assetId);
        if (
            asset === null ||
            asset.ownerId !== owner.id ||
            asset.kind !== "woka" ||
            asset.mediaType !== "image/png" ||
            asset.deletedAt !== null
        ) {
            throw new TeapotDataNotFoundError(`Woka asset ${assetId} does not exist for this owner`);
        }
        const activeAssetId =
            readTeapotWokaCategory(asset.metadata) === "woka"
                ? (await this.repository.selectWoka(owner.id, assetId)).assetId
                : await this.getActiveWholeWokaAssetId(owner.id);
        return this.toView(asset, activeAssetId);
    }

    async delete(providerSubject: string, textureId: string): Promise<void> {
        const owner = await this.resolveOwner(providerSubject);
        await this.authorization.assertCapability(owner.id, "asset.manage-own");
        const asset = await this.repository.deleteWoka(owner.id, requireGeneratedAssetId(textureId));
        try {
            await this.objectStore.delete(asset.objectReference);
        } catch (error: unknown) {
            const cause = asError(error);
            console.error(`Failed to remove deleted Woka object ${asset.id}`, cause);
            Sentry.captureException(cause);
        }
    }

    async listTextures(providerSubject: string, category: TeapotWokaCategory = "woka"): Promise<WokaTexture[]> {
        const list = await this.list(providerSubject);
        return list.items
            .filter((item) => item.category === category)
            .map((item) => ({ id: item.id, name: item.name, url: item.url }));
    }

    async listTexturesByCategory(providerSubject: string): Promise<Record<TeapotWokaCategory, WokaTexture[]>> {
        const grouped = Object.fromEntries(
            TEAPOT_WOKA_CATEGORIES.map((category) => [category, [] as WokaTexture[]]),
        ) as Record<TeapotWokaCategory, WokaTexture[]>;
        const list = await this.list(providerSubject);
        for (const item of list.items) {
            grouped[item.category].push({ id: item.id, name: item.name, url: item.url });
        }
        return grouped;
    }

    async resolveGeneratedWokaDetails(
        providerSubject: string,
        textureIds: string[],
        expectedCategories?: TeapotWokaCategory[],
    ): Promise<WokaDetail[] | undefined> {
        if (expectedCategories !== undefined && expectedCategories.length !== textureIds.length) return undefined;
        const owner = await this.resolveOwner(providerSubject);
        const details: WokaDetail[] = [];
        for (const [index, textureId] of textureIds.entries()) {
            const assetId = parseGeneratedAssetId(textureId);
            if (assetId === null) return undefined;
            // eslint-disable-next-line no-await-in-loop -- preserve request order and stop at the first invalid texture
            const asset = await this.repository.getAsset(assetId);
            if (
                asset === null ||
                asset.ownerId !== owner.id ||
                asset.kind !== "woka" ||
                asset.mediaType !== "image/png" ||
                asset.deletedAt !== null
            ) {
                return undefined;
            }
            const expectedCategory = expectedCategories?.[index];
            if (expectedCategory !== undefined && readTeapotWokaCategory(asset.metadata) !== expectedCategory)
                return undefined;
            details.push({ id: textureId, url: this.assetUrl(asset) });
        }
        return details;
    }

    async getPublicRaster(assetId: string): Promise<TeapotWokaRaster | null> {
        if (!ASSET_ID_PATTERN.test(assetId)) return null;
        const asset = await this.repository.getAsset(assetId);
        if (asset === null || asset.kind !== "woka" || asset.mediaType !== "image/png" || asset.deletedAt !== null) {
            return null;
        }
        const bytes = await this.objectStore.get(asset.objectReference);
        if (bytes === null) return null;
        return { bytes, etag: readMetadataString(asset.metadata, "sha256") ?? asset.id };
    }

    private async resolveOwner(providerSubject: string): Promise<TeapotIdentity> {
        return resolveTeapotOwnerIdentity(this.repository, this.identity, providerSubject, this.identityProvider);
    }

    private toView(asset: TeapotAssetRecord, activeAssetId: string | null): TeapotWokaView {
        return {
            id: toGeneratedTextureId(asset.id),
            name: readMetadataString(asset.metadata, "name") ?? "Generated Woka",
            url: this.assetUrl(asset),
            category: readTeapotWokaCategory(asset.metadata),
            active: asset.id === activeAssetId,
            createdAt: asset.createdAt,
        };
    }

    private async getActiveWholeWokaAssetId(ownerId: string): Promise<string | null> {
        const selection = await this.repository.getActiveWokaSelection(ownerId);
        if (selection === null) return null;
        const asset = await this.repository.getAsset(selection.assetId);
        if (
            asset === null ||
            asset.ownerId !== ownerId ||
            asset.kind !== "woka" ||
            asset.mediaType !== "image/png" ||
            asset.deletedAt !== null ||
            readTeapotWokaCategory(asset.metadata) !== "woka"
        ) {
            return null;
        }
        return asset.id;
    }

    private assetUrl(asset: TeapotAssetRecord): string {
        const base = `${this.publicPusherUrl}/teapot/woka-assets/${encodeURIComponent(asset.id)}.png`;
        const frameWidth = readMetadataNumber(asset.metadata, "frameWidth");
        const frameHeight = readMetadataNumber(asset.metadata, "frameHeight");
        if (frameWidth === null || frameHeight === null) return base;
        return `${base}?frameWidth=${frameWidth}&frameHeight=${frameHeight}`;
    }
}

export function isGeneratedWokaTextureId(textureId: string): boolean {
    return parseGeneratedAssetId(textureId) !== null;
}

export function toGeneratedTextureId(assetId: string): string {
    return `${GENERATED_TEXTURE_PREFIX}${assetId}`;
}

function parseGeneratedAssetId(textureId: string): string | null {
    if (!textureId.startsWith(GENERATED_TEXTURE_PREFIX)) return null;
    const assetId = textureId.slice(GENERATED_TEXTURE_PREFIX.length);
    return ASSET_ID_PATTERN.test(assetId) ? assetId : null;
}

function requireGeneratedAssetId(textureId: string): string {
    const assetId = parseGeneratedAssetId(textureId);
    if (assetId === null) {
        throw new TeapotDataNotFoundError(`Generated Woka texture ${textureId} does not exist`);
    }
    return assetId;
}

function normalizeName(requestedName: string): string {
    const name = requestedName.trim();
    if (name.length === 0 || name.length > MAX_WOKA_NAME_LENGTH) {
        throw new TeapotWokaValidationError(`Woka name must be between 1 and ${MAX_WOKA_NAME_LENGTH} characters`);
    }
    return name;
}

function readMetadataString(metadata: TeapotJsonValue, key: string): string | null {
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
    const value = metadata[key];
    return typeof value === "string" ? value : null;
}

function readMetadataNumber(metadata: TeapotJsonValue, key: string): number | null {
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) return null;
    const value = metadata[key];
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
