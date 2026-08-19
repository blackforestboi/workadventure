export const DEFAULT_VIEWPORT_CHUNK_SIZE = 64;

const DEFAULT_HALO_CHUNKS = 1;
const DEFAULT_MAX_FULL_DETAIL_CHUNKS = 25;
const DEFAULT_MAX_FULL_DETAIL_TILES = 102_400;
export const DEFAULT_EXACT_VISIBLE_TILE_LIMIT = 16_384;
const DEFAULT_CHUNK_PREVIEW_VISIBLE_TILE_LIMIT = 1_048_576;
const DEFAULT_MIN_EXACT_ZOOM = 0.5;
const DEFAULT_MIN_CHUNK_PREVIEW_ZOOM = 0.125;

export type ViewportDetailLevel = "exact" | "chunk-preview" | "region-summary";
export type ViewportChunkResidency = "core" | "halo";

/** A Phaser-style rectangle expressed in tile coordinates, not pixels. */
export interface TileViewport {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface ViewportStreamingOptions {
    readonly chunkSize?: number;
    readonly haloChunks?: number;
    readonly maxFullDetailChunks?: number;
    readonly maxFullDetailTiles?: number;
    readonly exactVisibleTileLimit?: number;
    readonly chunkPreviewVisibleTileLimit?: number;
    readonly minExactZoom?: number;
    readonly minChunkPreviewZoom?: number;
    readonly worldBounds?: TileViewport;
}

export interface ViewportChunk {
    readonly x: number;
    readonly y: number;
    readonly key: string;
    readonly residency: ViewportChunkResidency;
}

export interface ViewportStreamingPlan {
    readonly detailLevel: ViewportDetailLevel;
    readonly visibleTileCount: number;
    readonly chunks: readonly ViewportChunk[];
    readonly fullDetailChunks: readonly ViewportChunk[];
    readonly coreChunkCount: number;
    readonly haloChunkCount: number;
    readonly deferredCoreChunkCount: number;
    readonly fullDetailChunkCapacity: number;
    readonly chunkSize: number;
}

interface IntegerTileBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxXExclusive: number;
    readonly maxYExclusive: number;
}

interface ResolvedOptions {
    readonly chunkSize: number;
    readonly haloChunks: number;
    readonly maxFullDetailChunks: number;
    readonly maxFullDetailTiles: number;
    readonly exactVisibleTileLimit: number;
    readonly chunkPreviewVisibleTileLimit: number;
    readonly minExactZoom: number;
    readonly minChunkPreviewZoom: number;
    readonly worldBounds: IntegerTileBounds | undefined;
}

/**
 * Builds a deterministic residency and LOD plan without allocating tile data.
 *
 * Core chunks intersect the visible viewport. Halo chunks surround the core and
 * are suitable for prefetching. Full-detail residency is always capped by both
 * the chunk and tile budgets; core chunks are selected before halo chunks.
 */
export function planViewportStreaming(
    viewport: TileViewport,
    zoom: number,
    options: ViewportStreamingOptions = {},
): ViewportStreamingPlan {
    const resolved = resolveOptions(options);
    assertFiniteNonNegative(zoom, "zoom");

    const viewportBounds = intersectBounds(toIntegerTileBounds(viewport, "viewport"), resolved.worldBounds);
    if (isEmpty(viewportBounds)) {
        return {
            detailLevel: "exact",
            visibleTileCount: 0,
            chunks: [],
            fullDetailChunks: [],
            coreChunkCount: 0,
            haloChunkCount: 0,
            deferredCoreChunkCount: 0,
            fullDetailChunkCapacity: getFullDetailChunkCapacity(resolved),
            chunkSize: resolved.chunkSize,
        };
    }

    const visibleTileCount = getTileCount(viewportBounds);
    const coreChunks = createCoreChunks(viewportBounds, resolved.chunkSize);
    const haloChunks = createHaloChunks(coreChunks, resolved);
    const fullDetailChunkCapacity = getFullDetailChunkCapacity(resolved);
    const prioritizedChunks = prioritizeChunks(coreChunks, haloChunks, viewportBounds, resolved.chunkSize);
    const fullDetailChunks = prioritizedChunks.slice(0, fullDetailChunkCapacity);
    const deferredCoreChunkCount = Math.max(0, coreChunks.length - fullDetailChunkCapacity);

    return {
        detailLevel: selectDetailLevel(
            visibleTileCount,
            zoom,
            deferredCoreChunkCount === 0,
            resolved.exactVisibleTileLimit,
            resolved.chunkPreviewVisibleTileLimit,
            resolved.minExactZoom,
            resolved.minChunkPreviewZoom,
        ),
        visibleTileCount,
        chunks: [...coreChunks, ...haloChunks],
        fullDetailChunks,
        coreChunkCount: coreChunks.length,
        haloChunkCount: haloChunks.length,
        deferredCoreChunkCount,
        fullDetailChunkCapacity,
        chunkSize: resolved.chunkSize,
    };
}

function resolveOptions(options: ViewportStreamingOptions): ResolvedOptions {
    const chunkSize = options.chunkSize ?? DEFAULT_VIEWPORT_CHUNK_SIZE;
    const haloChunks = options.haloChunks ?? DEFAULT_HALO_CHUNKS;
    const maxFullDetailChunks = options.maxFullDetailChunks ?? DEFAULT_MAX_FULL_DETAIL_CHUNKS;
    const maxFullDetailTiles = options.maxFullDetailTiles ?? DEFAULT_MAX_FULL_DETAIL_TILES;
    const exactVisibleTileLimit = options.exactVisibleTileLimit ?? DEFAULT_EXACT_VISIBLE_TILE_LIMIT;
    const chunkPreviewVisibleTileLimit =
        options.chunkPreviewVisibleTileLimit ?? DEFAULT_CHUNK_PREVIEW_VISIBLE_TILE_LIMIT;
    const minExactZoom = options.minExactZoom ?? DEFAULT_MIN_EXACT_ZOOM;
    const minChunkPreviewZoom = options.minChunkPreviewZoom ?? DEFAULT_MIN_CHUNK_PREVIEW_ZOOM;

    assertPositiveInteger(chunkSize, "chunkSize");
    assertNonNegativeInteger(haloChunks, "haloChunks");
    assertNonNegativeInteger(maxFullDetailChunks, "maxFullDetailChunks");
    assertNonNegativeInteger(maxFullDetailTiles, "maxFullDetailTiles");
    assertNonNegativeInteger(exactVisibleTileLimit, "exactVisibleTileLimit");
    assertNonNegativeInteger(chunkPreviewVisibleTileLimit, "chunkPreviewVisibleTileLimit");
    assertFiniteNonNegative(minExactZoom, "minExactZoom");
    assertFiniteNonNegative(minChunkPreviewZoom, "minChunkPreviewZoom");

    if (chunkPreviewVisibleTileLimit < exactVisibleTileLimit) {
        throw new Error("chunkPreviewVisibleTileLimit must be greater than or equal to exactVisibleTileLimit");
    }
    if (minChunkPreviewZoom > minExactZoom) {
        throw new Error("minChunkPreviewZoom must be less than or equal to minExactZoom");
    }

    return {
        chunkSize,
        haloChunks,
        maxFullDetailChunks,
        maxFullDetailTiles,
        exactVisibleTileLimit,
        chunkPreviewVisibleTileLimit,
        minExactZoom,
        minChunkPreviewZoom,
        worldBounds:
            options.worldBounds === undefined ? undefined : toIntegerTileBounds(options.worldBounds, "worldBounds"),
    };
}

function createCoreChunks(bounds: IntegerTileBounds, chunkSize: number): ViewportChunk[] {
    const minChunkX = Math.floor(bounds.minX / chunkSize);
    const minChunkY = Math.floor(bounds.minY / chunkSize);
    const maxChunkX = Math.floor((bounds.maxXExclusive - 1) / chunkSize);
    const maxChunkY = Math.floor((bounds.maxYExclusive - 1) / chunkSize);
    const chunks: ViewportChunk[] = [];

    for (let y = minChunkY; y <= maxChunkY; y += 1) {
        for (let x = minChunkX; x <= maxChunkX; x += 1) {
            chunks.push(createChunk(x, y, "core"));
        }
    }

    return chunks;
}

function createHaloChunks(coreChunks: readonly ViewportChunk[], options: ResolvedOptions): ViewportChunk[] {
    if (coreChunks.length === 0 || options.haloChunks === 0) return [];

    const minCoreX = Math.min(...coreChunks.map(({ x }) => x));
    const maxCoreX = Math.max(...coreChunks.map(({ x }) => x));
    const minCoreY = Math.min(...coreChunks.map(({ y }) => y));
    const maxCoreY = Math.max(...coreChunks.map(({ y }) => y));
    const coreKeys = new Set(coreChunks.map(({ key }) => key));
    const chunks: ViewportChunk[] = [];

    for (let y = minCoreY - options.haloChunks; y <= maxCoreY + options.haloChunks; y += 1) {
        for (let x = minCoreX - options.haloChunks; x <= maxCoreX + options.haloChunks; x += 1) {
            const key = getChunkKey(x, y);
            if (coreKeys.has(key) || !chunkIntersectsWorld(x, y, options.chunkSize, options.worldBounds)) continue;
            chunks.push(createChunk(x, y, "halo"));
        }
    }

    return chunks;
}

function prioritizeChunks(
    coreChunks: readonly ViewportChunk[],
    haloChunks: readonly ViewportChunk[],
    viewportBounds: IntegerTileBounds,
    chunkSize: number,
): ViewportChunk[] {
    const centerX = (viewportBounds.minX + viewportBounds.maxXExclusive) / 2 / chunkSize;
    const centerY = (viewportBounds.minY + viewportBounds.maxYExclusive) / 2 / chunkSize;

    return [...coreChunks, ...haloChunks].sort((left, right) => {
        const residencyDifference = residencyPriority(left.residency) - residencyPriority(right.residency);
        if (residencyDifference !== 0) return residencyDifference;

        const distanceDifference =
            distanceFromViewportCenter(left, centerX, centerY) - distanceFromViewportCenter(right, centerX, centerY);
        if (distanceDifference !== 0) return distanceDifference;
        if (left.y !== right.y) return left.y - right.y;
        return left.x - right.x;
    });
}

function selectDetailLevel(
    visibleTileCount: number,
    zoom: number,
    allCoreChunksFit: boolean,
    exactVisibleTileLimit: number,
    chunkPreviewVisibleTileLimit: number,
    minExactZoom: number,
    minChunkPreviewZoom: number,
): ViewportDetailLevel {
    if (allCoreChunksFit && visibleTileCount <= exactVisibleTileLimit && zoom >= minExactZoom) return "exact";
    if (visibleTileCount <= chunkPreviewVisibleTileLimit && zoom >= minChunkPreviewZoom) return "chunk-preview";
    return "region-summary";
}

function toIntegerTileBounds(viewport: TileViewport, name: string): IntegerTileBounds {
    assertFinite(viewport.x, `${name}.x`);
    assertFinite(viewport.y, `${name}.y`);
    assertFiniteNonNegative(viewport.width, `${name}.width`);
    assertFiniteNonNegative(viewport.height, `${name}.height`);

    return {
        minX: Math.floor(viewport.x),
        minY: Math.floor(viewport.y),
        maxXExclusive: Math.ceil(viewport.x + viewport.width),
        maxYExclusive: Math.ceil(viewport.y + viewport.height),
    };
}

function intersectBounds(bounds: IntegerTileBounds, worldBounds: IntegerTileBounds | undefined): IntegerTileBounds {
    if (worldBounds === undefined) return bounds;

    return {
        minX: Math.max(bounds.minX, worldBounds.minX),
        minY: Math.max(bounds.minY, worldBounds.minY),
        maxXExclusive: Math.min(bounds.maxXExclusive, worldBounds.maxXExclusive),
        maxYExclusive: Math.min(bounds.maxYExclusive, worldBounds.maxYExclusive),
    };
}

function getTileCount(bounds: IntegerTileBounds): number {
    const tileCount = (bounds.maxXExclusive - bounds.minX) * (bounds.maxYExclusive - bounds.minY);
    if (!Number.isSafeInteger(tileCount)) throw new Error("viewport tile count exceeds the safe integer range");
    return tileCount;
}

function getFullDetailChunkCapacity(options: ResolvedOptions): number {
    const tilesPerChunk = options.chunkSize * options.chunkSize;
    return Math.min(options.maxFullDetailChunks, Math.floor(options.maxFullDetailTiles / tilesPerChunk));
}

function chunkIntersectsWorld(
    chunkX: number,
    chunkY: number,
    chunkSize: number,
    worldBounds: IntegerTileBounds | undefined,
): boolean {
    if (worldBounds === undefined) return true;

    const minX = chunkX * chunkSize;
    const minY = chunkY * chunkSize;
    return (
        minX < worldBounds.maxXExclusive &&
        minX + chunkSize > worldBounds.minX &&
        minY < worldBounds.maxYExclusive &&
        minY + chunkSize > worldBounds.minY
    );
}

function createChunk(x: number, y: number, residency: ViewportChunkResidency): ViewportChunk {
    return { x, y, key: getChunkKey(x, y), residency };
}

function getChunkKey(x: number, y: number): string {
    return `${x}:${y}`;
}

function residencyPriority(residency: ViewportChunkResidency): number {
    return residency === "core" ? 0 : 1;
}

function distanceFromViewportCenter(chunk: ViewportChunk, centerX: number, centerY: number): number {
    const x = chunk.x + 0.5 - centerX;
    const y = chunk.y + 0.5 - centerY;
    return x * x + y * y;
}

function isEmpty(bounds: IntegerTileBounds): boolean {
    return bounds.minX >= bounds.maxXExclusive || bounds.minY >= bounds.maxYExclusive;
}

function assertPositiveInteger(value: number, name: string): void {
    if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
}

function assertNonNegativeInteger(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

function assertFiniteNonNegative(value: number, name: string): void {
    assertFinite(value, name);
    if (value < 0) throw new Error(`${name} must be non-negative`);
}

function assertFinite(value: number, name: string): void {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}
