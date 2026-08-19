import { STREAMED_TILE_CHUNK_SIZE, getMapTileBounds, type ChunkTileBounds } from "@workadventure/map-editor";
import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";

export const RESIDENT_TILE_WINDOW_CHUNKS = 5;
export const RESIDENT_TILE_WINDOW_SIZE = RESIDENT_TILE_WINDOW_CHUNKS * STREAMED_TILE_CHUNK_SIZE;
export const STREAMING_TILE_CELL_THRESHOLD = 1_000_000;

/**
 * Enables the bounded runtime path before a map can create a million dense layer cells.
 * Chunked infinite maps are required because they can be projected without reading a world-sized array.
 */
export function shouldUseResidentTileWindow(map: ITiledMap): boolean {
    if (map.infinite !== true || !hasChunkedTileLayer(map.layers)) return false;
    const bounds = getDeclaredWorldTileBounds(map);
    const tileLayerCount = countTileLayers(map.layers);
    return bounds.width * bounds.height * Math.max(1, tileLayerCount) > STREAMING_TILE_CELL_THRESHOLD;
}

/** Returns a chunk-aligned resident window centred on a tile and clipped to the signed world bounds. */
export function getResidentTileWindow(map: ITiledMap, focusTile: { x: number; y: number }): ChunkTileBounds {
    const world = getDeclaredWorldTileBounds(map);
    const width = Math.min(world.width, RESIDENT_TILE_WINDOW_SIZE);
    const height = Math.min(world.height, RESIDENT_TILE_WINDOW_SIZE);
    const halfChunkCount = Math.floor(RESIDENT_TILE_WINDOW_CHUNKS / 2);
    const chunkX = Math.floor(focusTile.x / STREAMED_TILE_CHUNK_SIZE);
    const chunkY = Math.floor(focusTile.y / STREAMED_TILE_CHUNK_SIZE);
    const desiredX = (chunkX - halfChunkCount) * STREAMED_TILE_CHUNK_SIZE;
    const desiredY = (chunkY - halfChunkCount) * STREAMED_TILE_CHUNK_SIZE;

    return {
        x: clamp(desiredX, world.minX, world.maxX - width),
        y: clamp(desiredY, world.minY, world.maxY - height),
        width,
        height,
    };
}

function getDeclaredWorldTileBounds(map: ITiledMap): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
} {
    const declaredLayer = findTileLayerWithDeclaredBounds(map.layers);
    const width = map.width ?? declaredLayer?.width;
    const height = map.height ?? declaredLayer?.height;
    if (width !== undefined && height !== undefined && width > 0 && height > 0) {
        const minX = declaredLayer?.startx ?? declaredLayer?.x ?? 0;
        const minY = declaredLayer?.starty ?? declaredLayer?.y ?? 0;
        return { minX, minY, maxX: minX + width, maxY: minY + height, width, height };
    }
    return getMapTileBounds(map);
}

function findTileLayerWithDeclaredBounds(
    layers: readonly ITiledMapLayer[],
): Extract<ITiledMapLayer, { type: "tilelayer" }> | undefined {
    for (const layer of layers) {
        if (layer.type === "tilelayer") return layer;
        if (layer.type === "group") {
            const child = findTileLayerWithDeclaredBounds(layer.layers);
            if (child !== undefined) return child;
        }
    }
    return undefined;
}

/** Keeps the current allocation while the camera remains inside its central three chunks. */
export function residentTileWindowNeedsRecentering(
    resident: ChunkTileBounds,
    focusTile: { x: number; y: number },
): boolean {
    const inset = STREAMED_TILE_CHUNK_SIZE;
    return (
        focusTile.x < resident.x + inset ||
        focusTile.y < resident.y + inset ||
        focusTile.x >= resident.x + resident.width - inset ||
        focusTile.y >= resident.y + resident.height - inset
    );
}

function hasChunkedTileLayer(layers: readonly ITiledMapLayer[]): boolean {
    return layers.some((layer) => {
        if (layer.type === "group") return hasChunkedTileLayer(layer.layers);
        return layer.type === "tilelayer" && layer.chunks !== undefined;
    });
}

function countTileLayers(layers: readonly ITiledMapLayer[]): number {
    return layers.reduce(
        (count, layer) =>
            count + (layer.type === "group" ? countTileLayers(layer.layers) : layer.type === "tilelayer" ? 1 : 0),
        0,
    );
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(Math.max(value, minimum), maximum);
}
