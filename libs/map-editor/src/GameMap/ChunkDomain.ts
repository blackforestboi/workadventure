import type { ITiledMap, ITiledMapLayer, ITiledMapTileLayer } from "@workadventure/tiled-map-type-guard";

export const STREAMED_TILE_CHUNK_SIZE = 64;

export interface ChunkCoordinates {
    x: number;
    y: number;
}

export type ChunkKey = string;

/** A half-open tile rectangle: [x, x + width) × [y, y + height). */
export interface ChunkTileBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A half-open world-pixel rectangle: [x, x + width) × [y, y + height). */
export interface ChunkWorldBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** A half-open rectangle in chunk coordinates. */
export interface ChunkCoordinateBounds {
    minX: number;
    minY: number;
    maxXExclusive: number;
    maxYExclusive: number;
    width: number;
    height: number;
}

export interface TileChunkLocation {
    chunk: ChunkCoordinates;
    localX: number;
    localY: number;
    localIndex: number;
}

export interface ActiveChunkSelectionOptions {
    tileWidth: number;
    tileHeight: number;
    maxActiveChunks: number;
    haloChunks?: number;
}

export interface ActiveChunkSelection {
    viewportTiles: ChunkTileBounds;
    coreBounds: ChunkCoordinateBounds;
    activeBounds: ChunkCoordinateBounds;
    core: ChunkCoordinates[];
    halo: ChunkCoordinates[];
    requiredCoreChunkCount: number;
    candidateChunkCount: number;
    isCoreTruncated: boolean;
    isHaloTruncated: boolean;
}

export interface SparseChunkTile<T> {
    tileX: number;
    tileY: number;
    value: T;
}

export function chunkCoordinatesToKey(coordinates: ChunkCoordinates): ChunkKey {
    assertSafeInteger(coordinates.x, "Chunk x");
    assertSafeInteger(coordinates.y, "Chunk y");
    return `${coordinates.x},${coordinates.y}`;
}

export function chunkKeyToCoordinates(key: ChunkKey): ChunkCoordinates {
    const match = /^(-?\d+),(-?\d+)$/.exec(key);
    if (match === null) throw new Error(`Invalid chunk key: ${key}`);

    const x = Number(match[1]);
    const y = Number(match[2]);
    assertSafeInteger(x, "Chunk x");
    assertSafeInteger(y, "Chunk y");
    return { x, y };
}

export function tileToChunkLocation(tileX: number, tileY: number): TileChunkLocation {
    assertSafeInteger(tileX, "Tile x");
    assertSafeInteger(tileY, "Tile y");
    const chunk = {
        x: Math.floor(tileX / STREAMED_TILE_CHUNK_SIZE),
        y: Math.floor(tileY / STREAMED_TILE_CHUNK_SIZE),
    };
    const localX = tileX - chunk.x * STREAMED_TILE_CHUNK_SIZE;
    const localY = tileY - chunk.y * STREAMED_TILE_CHUNK_SIZE;

    return {
        chunk,
        localX,
        localY,
        localIndex: localY * STREAMED_TILE_CHUNK_SIZE + localX,
    };
}

export function getChunkTileBounds(coordinates: ChunkCoordinates): ChunkTileBounds {
    assertSafeInteger(coordinates.x, "Chunk x");
    assertSafeInteger(coordinates.y, "Chunk y");
    return {
        x: coordinates.x * STREAMED_TILE_CHUNK_SIZE,
        y: coordinates.y * STREAMED_TILE_CHUNK_SIZE,
        width: STREAMED_TILE_CHUNK_SIZE,
        height: STREAMED_TILE_CHUNK_SIZE,
    };
}

export function getChunkWorldBounds(
    coordinates: ChunkCoordinates,
    tileWidth: number,
    tileHeight: number,
): ChunkWorldBounds {
    assertPositiveFinite(tileWidth, "Tile width");
    assertPositiveFinite(tileHeight, "Tile height");
    const tileBounds = getChunkTileBounds(coordinates);
    return {
        x: tileBounds.x * tileWidth,
        y: tileBounds.y * tileHeight,
        width: tileBounds.width * tileWidth,
        height: tileBounds.height * tileHeight,
    };
}

export function worldBoundsToTileBounds(
    bounds: ChunkWorldBounds,
    tileWidth: number,
    tileHeight: number,
): ChunkTileBounds {
    assertPositiveBounds(bounds, "World bounds");
    assertPositiveFinite(tileWidth, "Tile width");
    assertPositiveFinite(tileHeight, "Tile height");

    const x = Math.floor(bounds.x / tileWidth);
    const y = Math.floor(bounds.y / tileHeight);
    const maxXExclusive = Math.ceil((bounds.x + bounds.width) / tileWidth);
    const maxYExclusive = Math.ceil((bounds.y + bounds.height) / tileHeight);
    return { x, y, width: maxXExclusive - x, height: maxYExclusive - y };
}

export function tileBoundsToChunkBounds(bounds: ChunkTileBounds): ChunkCoordinateBounds {
    assertPositiveIntegerBounds(bounds, "Tile bounds");
    const minX = Math.floor(bounds.x / STREAMED_TILE_CHUNK_SIZE);
    const minY = Math.floor(bounds.y / STREAMED_TILE_CHUNK_SIZE);
    const maxXExclusive = Math.ceil((bounds.x + bounds.width) / STREAMED_TILE_CHUNK_SIZE);
    const maxYExclusive = Math.ceil((bounds.y + bounds.height) / STREAMED_TILE_CHUNK_SIZE);
    return createChunkCoordinateBounds(minX, minY, maxXExclusive, maxYExclusive);
}

export function worldBoundsToChunkBounds(
    bounds: ChunkWorldBounds,
    tileWidth: number,
    tileHeight: number,
): ChunkCoordinateBounds {
    return tileBoundsToChunkBounds(worldBoundsToTileBounds(bounds, tileWidth, tileHeight));
}

export function* iterateChunks(bounds: ChunkCoordinateBounds): IterableIterator<ChunkCoordinates> {
    for (let y = bounds.minY; y < bounds.maxYExclusive; y += 1) {
        for (let x = bounds.minX; x < bounds.maxXExclusive; x += 1) {
            yield { x, y };
        }
    }
}

/**
 * Selects full-detail chunks nearest the viewport centre. Core chunks always take priority over halo chunks, and the
 * result never exceeds maxActiveChunks even when a far-zoomed viewport spans a much larger part of the world.
 */
export function selectActiveChunks(
    viewport: ChunkWorldBounds,
    options: ActiveChunkSelectionOptions,
): ActiveChunkSelection {
    assertPositiveInteger(options.maxActiveChunks, "Maximum active chunks");
    const haloChunks = options.haloChunks ?? 1;
    assertNonNegativeInteger(haloChunks, "Halo chunks");

    const viewportTiles = worldBoundsToTileBounds(viewport, options.tileWidth, options.tileHeight);
    const coreBounds = tileBoundsToChunkBounds(viewportTiles);
    const activeBounds = expandChunkBounds(coreBounds, haloChunks);
    const requiredCoreChunkCount = getChunkCount(coreBounds);
    const candidateChunkCount = getChunkCount(activeBounds);
    const center = tileToChunkLocation(
        Math.floor(viewportTiles.x + viewportTiles.width / 2),
        Math.floor(viewportTiles.y + viewportTiles.height / 2),
    ).chunk;

    const core = takeNearestChunks(coreBounds, center, options.maxActiveChunks);
    const haloBudget = options.maxActiveChunks - core.length;
    const halo = takeNearestChunks(activeBounds, center, haloBudget, coreBounds);
    const haloCandidateCount = candidateChunkCount - requiredCoreChunkCount;

    return {
        viewportTiles,
        coreBounds,
        activeBounds,
        core,
        halo,
        requiredCoreChunkCount,
        candidateChunkCount,
        isCoreTruncated: core.length < requiredCoreChunkCount,
        isHaloTruncated: halo.length < haloCandidateCount,
    };
}

/**
 * Produces an isolated Tiled map containing only tile payload inside bounds. Chunk coordinates remain in world-tile
 * space, while every tile layer advertises the same resident window through startx/starty/width/height.
 */
export function projectTiledMapToTileBounds(source: ITiledMap, bounds: ChunkTileBounds): ITiledMap {
    assertPositiveIntegerBounds(bounds, "Projection bounds");
    const { layers, ...mapMetadata } = source;
    return {
        ...structuredClone(mapMetadata),
        width: bounds.width,
        height: bounds.height,
        layers: projectTiledLayers(layers, bounds),
    };
}

/**
 * Stores only populated cells, grouped first by layer and then by 64×64 chunk. No world-sized arrays are created.
 */
export class SparseLayerChunkStore<T> {
    private readonly layers = new Map<string, Map<ChunkKey, Map<number, T>>>();
    private storedTileCount = 0;

    public get layerCount(): number {
        return this.layers.size;
    }

    public get chunkCount(): number {
        let count = 0;
        for (const chunks of this.layers.values()) count += chunks.size;
        return count;
    }

    public get tileCount(): number {
        return this.storedTileCount;
    }

    public get(layer: string, tileX: number, tileY: number): T | undefined {
        const location = tileToChunkLocation(tileX, tileY);
        return this.layers.get(layer)?.get(chunkCoordinatesToKey(location.chunk))?.get(location.localIndex);
    }

    public set(layer: string, tileX: number, tileY: number, value: T): void {
        assertLayerName(layer);
        const location = tileToChunkLocation(tileX, tileY);
        const key = chunkCoordinatesToKey(location.chunk);
        let chunks = this.layers.get(layer);
        if (chunks === undefined) {
            chunks = new Map();
            this.layers.set(layer, chunks);
        }
        let values = chunks.get(key);
        if (values === undefined) {
            values = new Map();
            chunks.set(key, values);
        }
        if (!values.has(location.localIndex)) this.storedTileCount += 1;
        values.set(location.localIndex, value);
    }

    public delete(layer: string, tileX: number, tileY: number): boolean {
        const location = tileToChunkLocation(tileX, tileY);
        const chunks = this.layers.get(layer);
        if (chunks === undefined) return false;
        const key = chunkCoordinatesToKey(location.chunk);
        const values = chunks.get(key);
        if (values === undefined || !values.delete(location.localIndex)) return false;

        this.storedTileCount -= 1;
        if (values.size === 0) chunks.delete(key);
        if (chunks.size === 0) this.layers.delete(layer);
        return true;
    }

    public hasChunk(layer: string, coordinates: ChunkCoordinates): boolean {
        return this.layers.get(layer)?.has(chunkCoordinatesToKey(coordinates)) ?? false;
    }

    public getLayerChunks(layer: string): ChunkCoordinates[] {
        const chunks = this.layers.get(layer);
        if (chunks === undefined) return [];
        return Array.from(chunks.keys(), chunkKeyToCoordinates).sort(compareChunkCoordinates);
    }

    public *getChunkTiles(layer: string, coordinates: ChunkCoordinates): IterableIterator<SparseChunkTile<T>> {
        const values = this.layers.get(layer)?.get(chunkCoordinatesToKey(coordinates));
        if (values === undefined) return;
        const originX = coordinates.x * STREAMED_TILE_CHUNK_SIZE;
        const originY = coordinates.y * STREAMED_TILE_CHUNK_SIZE;

        for (const [localIndex, value] of values) {
            yield {
                tileX: originX + (localIndex % STREAMED_TILE_CHUNK_SIZE),
                tileY: originY + Math.floor(localIndex / STREAMED_TILE_CHUNK_SIZE),
                value,
            };
        }
    }

    public deleteChunk(layer: string, coordinates: ChunkCoordinates): boolean {
        const chunks = this.layers.get(layer);
        if (chunks === undefined) return false;
        const values = chunks.get(chunkCoordinatesToKey(coordinates));
        if (values === undefined) return false;

        this.storedTileCount -= values.size;
        chunks.delete(chunkCoordinatesToKey(coordinates));
        if (chunks.size === 0) this.layers.delete(layer);
        return true;
    }

    public clearLayer(layer: string): boolean {
        const chunks = this.layers.get(layer);
        if (chunks === undefined) return false;
        for (const values of chunks.values()) this.storedTileCount -= values.size;
        this.layers.delete(layer);
        return true;
    }
}

function projectTiledLayers(layers: readonly ITiledMapLayer[], bounds: ChunkTileBounds): ITiledMapLayer[] {
    return layers.map((layer) => {
        if (layer.type === "group") {
            const { layers: childLayers, ...groupMetadata } = layer;
            return { ...structuredClone(groupMetadata), layers: projectTiledLayers(childLayers, bounds) };
        }
        if (layer.type === "tilelayer") return projectTileLayer(layer, bounds);
        return structuredClone(layer);
    });
}

function projectTileLayer(layer: ITiledMapTileLayer, bounds: ChunkTileBounds): ITiledMapTileLayer {
    const { data, chunks, ...layerMetadata } = layer;
    const projectedMetadata = {
        ...structuredClone(layerMetadata),
        startx: bounds.x,
        starty: bounds.y,
        width: bounds.width,
        height: bounds.height,
        x: 0,
        y: 0,
    };

    if (chunks !== undefined) {
        return {
            ...projectedMetadata,
            data: [],
            chunks: chunks.flatMap((chunk) => {
                const projected = projectTileChunk(chunk, bounds);
                return projected === undefined ? [] : [projected];
            }),
        };
    }
    if (!Array.isArray(data)) throw new Error(`Cannot project encoded tile layer ${layer.name}`);
    return { ...projectedMetadata, data: projectDenseTileData(layer, data, bounds) };
}

function projectTileChunk(
    chunk: NonNullable<ITiledMapTileLayer["chunks"]>[number],
    bounds: ChunkTileBounds,
): NonNullable<ITiledMapTileLayer["chunks"]>[number] | undefined {
    const x = Math.max(chunk.x, bounds.x);
    const y = Math.max(chunk.y, bounds.y);
    const maxXExclusive = Math.min(chunk.x + chunk.width, bounds.x + bounds.width);
    const maxYExclusive = Math.min(chunk.y + chunk.height, bounds.y + bounds.height);
    if (x >= maxXExclusive || y >= maxYExclusive) return undefined;
    if (!Array.isArray(chunk.data)) throw new Error(`Cannot project encoded tile chunk at ${chunk.x},${chunk.y}`);

    const width = maxXExclusive - x;
    const height = maxYExclusive - y;
    const data = Array<number>(width * height);
    for (let targetY = 0; targetY < height; targetY += 1) {
        const sourceY = y - chunk.y + targetY;
        for (let targetX = 0; targetX < width; targetX += 1) {
            const sourceX = x - chunk.x + targetX;
            data[targetY * width + targetX] = chunk.data[sourceY * chunk.width + sourceX] ?? 0;
        }
    }
    return { ...structuredClone(chunk), x, y, width, height, data };
}

function projectDenseTileData(layer: ITiledMapTileLayer, sourceData: number[], bounds: ChunkTileBounds): number[] {
    const data = Array<number>(bounds.width * bounds.height).fill(0);
    const sourceX = layer.startx ?? layer.x ?? 0;
    const sourceY = layer.starty ?? layer.y ?? 0;
    const minX = Math.max(sourceX, bounds.x);
    const minY = Math.max(sourceY, bounds.y);
    const maxXExclusive = Math.min(sourceX + layer.width, bounds.x + bounds.width);
    const maxYExclusive = Math.min(sourceY + layer.height, bounds.y + bounds.height);

    for (let tileY = minY; tileY < maxYExclusive; tileY += 1) {
        for (let tileX = minX; tileX < maxXExclusive; tileX += 1) {
            const sourceIndex = (tileY - sourceY) * layer.width + tileX - sourceX;
            const targetIndex = (tileY - bounds.y) * bounds.width + tileX - bounds.x;
            data[targetIndex] = sourceData[sourceIndex] ?? 0;
        }
    }
    return data;
}

function createChunkCoordinateBounds(
    minX: number,
    minY: number,
    maxXExclusive: number,
    maxYExclusive: number,
): ChunkCoordinateBounds {
    return {
        minX,
        minY,
        maxXExclusive,
        maxYExclusive,
        width: maxXExclusive - minX,
        height: maxYExclusive - minY,
    };
}

function expandChunkBounds(bounds: ChunkCoordinateBounds, amount: number): ChunkCoordinateBounds {
    return createChunkCoordinateBounds(
        bounds.minX - amount,
        bounds.minY - amount,
        bounds.maxXExclusive + amount,
        bounds.maxYExclusive + amount,
    );
}

function getChunkCount(bounds: ChunkCoordinateBounds): number {
    return bounds.width * bounds.height;
}

function takeNearestChunks(
    bounds: ChunkCoordinateBounds,
    center: ChunkCoordinates,
    limit: number,
    excludedBounds?: ChunkCoordinateBounds,
): ChunkCoordinates[] {
    if (limit <= 0) return [];
    const selected: ChunkCoordinates[] = [];
    const maximumRadius = Math.max(
        Math.abs(center.x - bounds.minX),
        Math.abs(center.x - (bounds.maxXExclusive - 1)),
        Math.abs(center.y - bounds.minY),
        Math.abs(center.y - (bounds.maxYExclusive - 1)),
    );

    for (let radius = 0; radius <= maximumRadius && selected.length < limit; radius += 1) {
        const ring = getChunkRing(center, radius)
            .filter((coordinates) => containsChunk(bounds, coordinates) && !containsChunk(excludedBounds, coordinates))
            .sort((left, right) => {
                const leftDistance = squaredDistance(left, center);
                const rightDistance = squaredDistance(right, center);
                return leftDistance - rightDistance || compareChunkCoordinates(left, right);
            });
        selected.push(...ring.slice(0, limit - selected.length));
    }
    return selected;
}

function getChunkRing(center: ChunkCoordinates, radius: number): ChunkCoordinates[] {
    if (radius === 0) return [{ ...center }];
    const chunks: ChunkCoordinates[] = [];
    const minX = center.x - radius;
    const maxX = center.x + radius;
    const minY = center.y - radius;
    const maxY = center.y + radius;

    for (let x = minX; x <= maxX; x += 1) chunks.push({ x, y: minY }, { x, y: maxY });
    for (let y = minY + 1; y < maxY; y += 1) chunks.push({ x: minX, y }, { x: maxX, y });
    return chunks;
}

function containsChunk(bounds: ChunkCoordinateBounds | undefined, coordinates: ChunkCoordinates): boolean {
    return (
        bounds !== undefined &&
        coordinates.x >= bounds.minX &&
        coordinates.x < bounds.maxXExclusive &&
        coordinates.y >= bounds.minY &&
        coordinates.y < bounds.maxYExclusive
    );
}

function squaredDistance(left: ChunkCoordinates, right: ChunkCoordinates): number {
    return (left.x - right.x) ** 2 + (left.y - right.y) ** 2;
}

function compareChunkCoordinates(left: ChunkCoordinates, right: ChunkCoordinates): number {
    return left.y - right.y || left.x - right.x;
}

function assertLayerName(layer: string): void {
    if (layer.length === 0) throw new Error("Layer name cannot be empty");
}

function assertSafeInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}

function assertPositiveInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`);
}

function assertNonNegativeInteger(value: number, label: string): void {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
}

function assertPositiveFinite(value: number, label: string): void {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive`);
}

function assertPositiveBounds(bounds: ChunkWorldBounds, label: string): void {
    if (!Number.isFinite(bounds.x) || !Number.isFinite(bounds.y)) throw new Error(`${label} origin must be finite`);
    assertPositiveFinite(bounds.width, `${label} width`);
    assertPositiveFinite(bounds.height, `${label} height`);
}

function assertPositiveIntegerBounds(bounds: ChunkTileBounds, label: string): void {
    assertSafeInteger(bounds.x, `${label} x`);
    assertSafeInteger(bounds.y, `${label} y`);
    assertPositiveInteger(bounds.width, `${label} width`);
    assertPositiveInteger(bounds.height, `${label} height`);
}
