import type { ITiledMap, ITiledMapLayer, ITiledMapTileLayer } from "@workadventure/tiled-map-type-guard";
import { tileToChunkLocation } from "@workadventure/map-editor";

import {
    WORLD_CHUNK_SIZE,
    WorldManifestNotFoundError,
    type WorldChunk,
    type WorldChunkCoordinates,
    type WorldChunkInput,
    type WorldChunkRepository,
    type WorldManifest,
    type WorldManifestInput,
} from "./WorldChunkRepository";

const TMJ_SOURCE_CHUNK_SIZE = 16;

type TileLayer = Extract<ITiledMapLayer, { type: "tilelayer" }>;
type TileChunk = NonNullable<ITiledMapTileLayer["chunks"]>[number];

interface MutableImportedChunk {
    coordinates: WorldChunkCoordinates;
    layers: Map<string, Map<number, number>>;
}

export interface ImportedWorldChunk {
    coordinates: WorldChunkCoordinates;
    input: WorldChunkInput;
}

export interface TmjWorldImport {
    manifest: WorldManifestInput;
    chunks: ImportedWorldChunk[];
}

export interface PersistedTmjWorldImport {
    manifest: WorldManifest;
    chunks: WorldChunk[];
}

/**
 * Converts a Tiled map into a manifest and sparse 64x64 payloads. Tile cells are visited directly in their source
 * arrays/chunks; no array proportional to the declared world size is allocated.
 */
export function convertTmjToWorldChunks(source: ITiledMap, sourcePath?: string): TmjWorldImport {
    const tileLayers = flattenTileLayers(source.layers);
    const layerIds = new Set<string>();
    const manifestLayers = tileLayers.map((layer) => {
        const id = String(layer.id);
        if (layerIds.has(id)) throw new Error(`Tiled tile layer id ${layer.id} is duplicated`);
        layerIds.add(id);
        return { id, name: layer.name, sourceLayerId: layer.id };
    });
    const chunks = new Map<string, MutableImportedChunk>();

    for (const layer of tileLayers) {
        visitTileLayer(layer, (gid, tileX, tileY) => {
            if (gid === 0) return;
            if (!Number.isSafeInteger(gid) || gid < 0 || gid > 0xffffffff) {
                throw new Error(`Tile layer "${layer.name}" contains an invalid global tile id`);
            }

            const location = tileToChunkLocation(tileX, tileY);
            const key = `${location.chunk.x},${location.chunk.y}`;
            let chunk = chunks.get(key);
            if (chunk === undefined) {
                chunk = { coordinates: location.chunk, layers: new Map() };
                chunks.set(key, chunk);
            }
            let cells = chunk.layers.get(String(layer.id));
            if (cells === undefined) {
                cells = new Map();
                chunk.layers.set(String(layer.id), cells);
            }
            cells.set(location.localIndex, gid);
        });
    }

    return {
        manifest: {
            tileSize: {
                width: source.tilewidth ?? 32,
                height: source.tileheight ?? 32,
            },
            bounds: getDeclaredTileBounds(source, tileLayers),
            layers: manifestLayers,
            ...(sourcePath === undefined ? {} : { source: { format: "tmj" as const, path: sourcePath } }),
        },
        chunks: Array.from(chunks.values())
            .sort((left, right) => compareCoordinates(left.coordinates, right.coordinates))
            .map((chunk) => ({
                coordinates: chunk.coordinates,
                input: {
                    layers: Array.from(chunk.layers.entries())
                        .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
                        .map(([layerId, cells]) => ({ layerId, spans: cellsToSpans(cells) })),
                },
            })),
    };
}

/**
 * Compatibility boundary between existing TMJ maps and WorldChunkRepository. Imports are intentionally revisioned;
 * callers must opt into replacing a manifest, while imported chunks use repository compare-and-swap semantics.
 */
export class TmjWorldChunkBridge {
    public constructor(private readonly repository: WorldChunkRepository) {}

    public async importMap(
        worldId: string,
        source: ITiledMap,
        expectedManifestRevision = 0,
        sourcePath = worldId,
    ): Promise<PersistedTmjWorldImport> {
        const converted = convertTmjToWorldChunks(source, sourcePath);
        const manifest = await this.repository.writeManifest(worldId, expectedManifestRevision, converted.manifest);
        const chunks = await Promise.all(
            converted.chunks.map(async (convertedChunk): Promise<WorldChunk> => {
                const current = await this.repository.readChunk(worldId, convertedChunk.coordinates);
                return this.repository.writeChunk(
                    worldId,
                    convertedChunk.coordinates,
                    current?.revision ?? 0,
                    convertedChunk.input,
                );
            }),
        );
        return { manifest, chunks };
    }

    /** Returns an isolated TMJ view of one persisted chunk, or null when that sparse chunk does not exist. */
    public async readChunkAsTmj(
        worldId: string,
        coordinates: WorldChunkCoordinates,
        sourceTemplate: ITiledMap,
    ): Promise<ITiledMap | null> {
        const [manifest, chunk] = await Promise.all([
            this.repository.readManifest(worldId),
            this.repository.readChunk(worldId, coordinates),
        ]);
        if (manifest === null) throw new WorldManifestNotFoundError(worldId);
        if (chunk === null) return null;
        return applyWorldChunkToTmj(sourceTemplate, manifest, chunk);
    }
}

/**
 * Applies one repository chunk to a lightweight clone of a TMJ template. Tile layers contain at most sixteen 16x16
 * source chunks, so reading a chunk never materializes the manifest's complete world bounds.
 */
export function applyWorldChunkToTmj(source: ITiledMap, manifest: WorldManifest, chunk: WorldChunk): ITiledMap {
    if (manifest.worldId !== chunk.worldId) throw new Error("Manifest and chunk belong to different worlds");
    if (chunk.chunkSize !== WORLD_CHUNK_SIZE) throw new Error("Unsupported world chunk size");

    const originX = chunk.coordinates.x * WORLD_CHUNK_SIZE;
    const originY = chunk.coordinates.y * WORLD_CHUNK_SIZE;
    const sourceIdsByLayerId = new Map(
        manifest.layers.flatMap((layer) =>
            layer.sourceLayerId === undefined ? [] : [[layer.id, layer.sourceLayerId] as const],
        ),
    );
    const cellsBySourceLayerId = new Map<number, Map<number, number>>();
    for (const layer of chunk.layers) {
        const sourceLayerId = sourceIdsByLayerId.get(layer.layerId);
        if (sourceLayerId === undefined) continue;
        const cells = new Map<number, number>();
        for (const span of layer.spans) {
            for (const [offset, gid] of span.gids.entries()) cells.set(span.start + offset, gid);
        }
        cellsBySourceLayerId.set(sourceLayerId, cells);
    }

    const { layers: sourceLayers, ...mapMetadata } = source;
    return {
        ...structuredClone(mapMetadata),
        width: WORLD_CHUNK_SIZE,
        height: WORLD_CHUNK_SIZE,
        layers: cloneLayersForChunk(sourceLayers, cellsBySourceLayerId, originX, originY),
    };
}

function flattenTileLayers(layers: readonly ITiledMapLayer[]): TileLayer[] {
    return layers.flatMap((layer) =>
        layer.type === "group" ? flattenTileLayers(layer.layers) : layer.type === "tilelayer" ? [layer] : [],
    );
}

function visitTileLayer(layer: TileLayer, callback: (gid: number, tileX: number, tileY: number) => void): void {
    if (layer.chunks !== undefined) {
        for (const chunk of layer.chunks) {
            if (!Array.isArray(chunk.data))
                throw new Error(`Cannot import encoded tile chunk from layer "${layer.name}"`);
            for (let y = 0; y < chunk.height; y += 1) {
                for (let x = 0; x < chunk.width; x += 1) {
                    callback(chunk.data[y * chunk.width + x] ?? 0, chunk.x + x, chunk.y + y);
                }
            }
        }
        return;
    }
    if (!Array.isArray(layer.data)) throw new Error(`Cannot import encoded tile layer "${layer.name}"`);
    const startX = layer.startx ?? layer.x ?? 0;
    const startY = layer.starty ?? layer.y ?? 0;
    for (let y = 0; y < layer.height; y += 1) {
        for (let x = 0; x < layer.width; x += 1) {
            callback(layer.data[y * layer.width + x] ?? 0, startX + x, startY + y);
        }
    }
}

function getDeclaredTileBounds(source: ITiledMap, tileLayers: readonly TileLayer[]): WorldManifestInput["bounds"] {
    const rectangles: Array<{ minX: number; minY: number; maxX: number; maxY: number }> = [];
    if (source.infinite !== true && (source.width ?? 0) > 0 && (source.height ?? 0) > 0) {
        rectangles.push({ minX: 0, minY: 0, maxX: source.width ?? 0, maxY: source.height ?? 0 });
    }
    for (const layer of tileLayers) {
        const startX = layer.startx ?? layer.x ?? 0;
        const startY = layer.starty ?? layer.y ?? 0;
        if (layer.width > 0 && layer.height > 0) {
            rectangles.push({ minX: startX, minY: startY, maxX: startX + layer.width, maxY: startY + layer.height });
        }
        for (const chunk of layer.chunks ?? []) {
            if (chunk.width > 0 && chunk.height > 0) {
                rectangles.push({
                    minX: chunk.x,
                    minY: chunk.y,
                    maxX: chunk.x + chunk.width,
                    maxY: chunk.y + chunk.height,
                });
            }
        }
    }
    if (rectangles.length === 0) throw new Error("A TMJ world needs positive tile bounds");

    const minTileX = Math.min(...rectangles.map((rectangle) => rectangle.minX));
    const minTileY = Math.min(...rectangles.map((rectangle) => rectangle.minY));
    const maxTileX = Math.max(...rectangles.map((rectangle) => rectangle.maxX));
    const maxTileY = Math.max(...rectangles.map((rectangle) => rectangle.maxY));
    return { minTileX, minTileY, width: maxTileX - minTileX, height: maxTileY - minTileY };
}

function cellsToSpans(cells: ReadonlyMap<number, number>): WorldChunkInput["layers"][number]["spans"] {
    const sorted = Array.from(cells.entries()).sort(([left], [right]) => left - right);
    const spans: WorldChunkInput["layers"][number]["spans"] = [];
    for (const [index, gid] of sorted) {
        const current = spans.at(-1);
        if (current !== undefined && current.start + current.gids.length === index) current.gids.push(gid);
        else spans.push({ start: index, gids: [gid] });
    }
    return spans;
}

function cloneLayersForChunk(
    layers: readonly ITiledMapLayer[],
    cellsBySourceLayerId: ReadonlyMap<number, ReadonlyMap<number, number>>,
    originX: number,
    originY: number,
): ITiledMapLayer[] {
    return layers.map((layer) => {
        if (layer.type === "group") {
            const { layers: childLayers, ...groupMetadata } = layer;
            return {
                ...structuredClone(groupMetadata),
                layers: cloneLayersForChunk(childLayers, cellsBySourceLayerId, originX, originY),
            };
        }
        if (layer.type !== "tilelayer") return structuredClone(layer);

        const layerMetadata = structuredClone(layer);
        delete layerMetadata.chunks;
        delete layerMetadata.encoding;
        delete layerMetadata.compression;
        return {
            ...layerMetadata,
            x: 0,
            y: 0,
            startx: originX,
            starty: originY,
            width: WORLD_CHUNK_SIZE,
            height: WORLD_CHUNK_SIZE,
            data: [],
            chunks: createTmjSourceChunks(cellsBySourceLayerId.get(layer.id) ?? new Map(), originX, originY),
        };
    });
}

function createTmjSourceChunks(cells: ReadonlyMap<number, number>, originX: number, originY: number): TileChunk[] {
    const sourceChunks = new Map<string, { x: number; y: number; data: number[] }>();
    for (const [localIndex, gid] of cells) {
        const localX = localIndex % WORLD_CHUNK_SIZE;
        const localY = Math.floor(localIndex / WORLD_CHUNK_SIZE);
        const sourceChunkX = Math.floor(localX / TMJ_SOURCE_CHUNK_SIZE);
        const sourceChunkY = Math.floor(localY / TMJ_SOURCE_CHUNK_SIZE);
        const key = `${sourceChunkX},${sourceChunkY}`;
        let sourceChunk = sourceChunks.get(key);
        if (sourceChunk === undefined) {
            sourceChunk = {
                x: originX + sourceChunkX * TMJ_SOURCE_CHUNK_SIZE,
                y: originY + sourceChunkY * TMJ_SOURCE_CHUNK_SIZE,
                data: Array<number>(TMJ_SOURCE_CHUNK_SIZE * TMJ_SOURCE_CHUNK_SIZE).fill(0),
            };
            sourceChunks.set(key, sourceChunk);
        }
        const chunkLocalX = localX % TMJ_SOURCE_CHUNK_SIZE;
        const chunkLocalY = localY % TMJ_SOURCE_CHUNK_SIZE;
        sourceChunk.data[chunkLocalY * TMJ_SOURCE_CHUNK_SIZE + chunkLocalX] = gid;
    }
    return Array.from(sourceChunks.values())
        .sort((left, right) => left.y - right.y || left.x - right.x)
        .map((chunk) => ({
            ...chunk,
            width: TMJ_SOURCE_CHUNK_SIZE,
            height: TMJ_SOURCE_CHUNK_SIZE,
        }));
}

function compareCoordinates(left: WorldChunkCoordinates, right: WorldChunkCoordinates): number {
    return left.y - right.y || left.x - right.x;
}
