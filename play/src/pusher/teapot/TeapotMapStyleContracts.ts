import { TeapotDataConflictError } from "./TeapotDataErrors";
import type { TeapotJsonValue, TeapotMapStyleSourceLocator } from "./TeapotRecords";

export const TEAPOT_MAP_STYLE_NAME_MAX_LENGTH = 80;
export const TEAPOT_MAP_STYLE_METADATA_VERSION = 1;

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const BUILT_IN_NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const BUILT_IN_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/;
const FORBIDDEN_BUILT_IN_KEY = /(^|\/)(?:\.{1,2})(?:\/|$)|%2e|^[a-z][a-z0-9+.-]*:|^\/|\\/i;

const TRUSTED_METADATA_KEYS = new Set([
    "ownerId",
    "owner_id",
    "styleId",
    "style_id",
    "sourceLocator",
    "objectReference",
    "object_reference",
    "derivedFromAssetId",
    "derived_from_asset_id",
    "internalFlags",
    "moderation",
]);

export class TeapotMapStyleValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TeapotMapStyleValidationError";
    }
}

export function normalizeTeapotMapStyleName(value: string): { name: string; normalizedName: string } {
    const name = value.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (name.length === 0 || name.length > TEAPOT_MAP_STYLE_NAME_MAX_LENGTH) {
        throw new TeapotMapStyleValidationError(
            `Style name must be between 1 and ${TEAPOT_MAP_STYLE_NAME_MAX_LENGTH} characters`,
        );
    }
    const normalizedName = name.toLocaleLowerCase("en-US");
    if (normalizedName === "default") {
        throw new TeapotDataConflictError("Default is a reserved style name");
    }
    return { name, normalizedName };
}

export function assertTeapotMapStyleIdempotencyKey(value: string): string {
    const key = value.trim();
    if (key.length === 0 || key.length > 128 || !IDENTIFIER_PATTERN.test(key)) {
        throw new TeapotMapStyleValidationError("A valid idempotency key is required");
    }
    return key;
}

export function canonicalTeapotMapStyleSource(source: TeapotMapStyleSourceLocator): string {
    if (source.type === "teapot-asset") {
        if (source.sourceVersion !== 1 || !IDENTIFIER_PATTERN.test(source.assetId)) {
            throw new TeapotMapStyleValidationError("The source asset locator is invalid");
        }
        return `teapot-asset:${source.assetId}:v1`;
    }
    if (
        !Number.isSafeInteger(source.sourceVersion) ||
        source.sourceVersion <= 0 ||
        !BUILT_IN_NAMESPACE_PATTERN.test(source.namespace) ||
        !BUILT_IN_KEY_PATTERN.test(source.key) ||
        FORBIDDEN_BUILT_IN_KEY.test(source.key)
    ) {
        throw new TeapotMapStyleValidationError("The built-in source locator is invalid");
    }
    return `built-in:${source.namespace}:${source.key}:v${source.sourceVersion}`;
}

/**
 * Preserve user-visible search/render metadata while removing fields whose authority belongs to persistence.
 * JSON values are rebuilt instead of mutating the source metadata object.
 */
export function cloneTeapotMapStyleMetadata(metadata: TeapotJsonValue): TeapotJsonValue {
    if (Array.isArray(metadata)) return metadata.map(cloneTeapotMapStyleMetadata);
    if (metadata === null || typeof metadata !== "object") return metadata;
    return Object.fromEntries(
        Object.entries(metadata)
            .filter(([key]) => !TRUSTED_METADATA_KEYS.has(key))
            .map(([key, value]) => [key, cloneTeapotMapStyleMetadata(value)]),
    );
}
