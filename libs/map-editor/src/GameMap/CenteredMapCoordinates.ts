import type {
    ITiledMap,
    ITiledMapLayer,
    ITiledMapProperty,
    ITiledMapTileLayer,
} from "@workadventure/tiled-map-type-guard";

export const CENTERED_COORDINATE_SYSTEM = "centered-v1";
export const CENTERED_COORDINATE_SYSTEM_PROPERTY = "workadventure:coordinateSystem";
export const CENTERED_CHUNK_ORIGIN_X_PROPERTY = "workadventure:chunkOriginX";
export const CENTERED_CHUNK_ORIGIN_Y_PROPERTY = "workadventure:chunkOriginY";
export const CENTERED_TILE_OFFSET_X_PROPERTY = "workadventure:tileOffsetX";
export const CENTERED_TILE_OFFSET_Y_PROPERTY = "workadventure:tileOffsetY";
export const CENTERED_TILE_CHUNK_SIZE = 16;

export interface TileCoordinates {
    x: number;
    y: number;
}

export interface TileBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

export interface WorldBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

type TileLayer = Extract<ITiledMapLayer, { type: "tilelayer" }>;
type TileChunk = NonNullable<ITiledMapTileLayer["chunks"]>[number];

export function isCenteredMap(map: ITiledMap): boolean {
    return getMapProperty(map, CENTERED_COORDINATE_SYSTEM_PROPERTY) === CENTERED_COORDINATE_SYSTEM;
}

/**
 * Creates the only map representation accepted by terrain authoring: an infinite, signed tile grid whose world origin
 * is fixed at the visual centre of the source map. This is a creation boundary, not a runtime migration path.
 */
export function createCenteredMap(source: ITiledMap): ITiledMap {
    if (source.orientation !== "orthogonal" || source.infinite === true) {
        throw new Error("A centered map must be created from a finite orthogonal source map");
    }
    const width = source.width ?? 0;
    const height = source.height ?? 0;
    const tileWidth = source.tilewidth ?? 32;
    const tileHeight = source.tileheight ?? 32;
    if (width <= 0 || height <= 0) throw new Error("A centered map needs positive tile dimensions");

    const startX = -Math.floor(width / 2);
    const startY = -Math.floor(height / 2);
    const centreX = (width * tileWidth) / 2;
    const centreY = (height * tileHeight) / 2;
    const tileOffsetX = -centreX - startX * tileWidth;
    const tileOffsetY = -centreY - startY * tileHeight;
    const map = structuredClone(source);

    centreLayers(map.layers, {
        width,
        height,
        startX,
        startY,
        centreX,
        centreY,
        tileWidth,
        tileHeight,
        tileOffsetX,
        tileOffsetY,
    });
    map.infinite = true;
    setMapProperty(map, CENTERED_COORDINATE_SYSTEM_PROPERTY, "string", CENTERED_COORDINATE_SYSTEM);
    setMapProperty(map, CENTERED_CHUNK_ORIGIN_X_PROPERTY, "int", startX);
    setMapProperty(map, CENTERED_CHUNK_ORIGIN_Y_PROPERTY, "int", startY);
    setMapProperty(map, CENTERED_TILE_OFFSET_X_PROPERTY, "float", tileOffsetX);
    setMapProperty(map, CENTERED_TILE_OFFSET_Y_PROPERTY, "float", tileOffsetY);
    synchronizeCenteredMapBounds(map);
    return map;
}

export function getMapTileBounds(map: ITiledMap): TileBounds {
    const tileLayers = flattenTileLayers(map.layers);
    const layerBounds = tileLayers.flatMap((layer) => {
        const chunkBounds = getChunkBounds(layer.chunks);
        if (chunkBounds !== undefined) return [chunkBounds];
        if (layer.width <= 0 || layer.height <= 0) return [];
        const minX = layer.startx ?? layer.x ?? 0;
        const minY = layer.starty ?? layer.y ?? 0;
        return [createTileBounds(minX, minY, minX + layer.width, minY + layer.height)];
    });
    if (layerBounds.length === 0) {
        const width = map.width ?? 0;
        const height = map.height ?? 0;
        return createTileBounds(0, 0, width, height);
    }
    return createTileBounds(
        Math.min(...layerBounds.map((bounds) => bounds.minX)),
        Math.min(...layerBounds.map((bounds) => bounds.minY)),
        Math.max(...layerBounds.map((bounds) => bounds.maxX)),
        Math.max(...layerBounds.map((bounds) => bounds.maxY)),
    );
}

export function getMapWorldBounds(map: ITiledMap): WorldBounds {
    const bounds = getMapTileBounds(map);
    const offset = getTileGridOffset(map);
    const tileWidth = map.tilewidth ?? 32;
    const tileHeight = map.tileheight ?? 32;
    return {
        x: offset.x + bounds.minX * tileWidth,
        y: offset.y + bounds.minY * tileHeight,
        width: bounds.width * tileWidth,
        height: bounds.height * tileHeight,
    };
}

export function getTileGridOffset(map: ITiledMap): TileCoordinates {
    if (isCenteredMap(map)) {
        return {
            x: getNumericMapProperty(map, CENTERED_TILE_OFFSET_X_PROPERTY),
            y: getNumericMapProperty(map, CENTERED_TILE_OFFSET_Y_PROPERTY),
        };
    }
    const tileLayers = flattenTileLayers(map.layers);
    return {
        x: Math.min(0, ...tileLayers.map((layer) => layer.offsetx ?? 0)),
        y: Math.min(0, ...tileLayers.map((layer) => layer.offsety ?? 0)),
    };
}

export function worldToTileCoordinates(map: ITiledMap, worldX: number, worldY: number): TileCoordinates {
    const offset = getTileGridOffset(map);
    return {
        x: Math.floor((worldX - offset.x) / (map.tilewidth ?? 32)),
        y: Math.floor((worldY - offset.y) / (map.tileheight ?? 32)),
    };
}

export function tileToWorldTopLeft(map: ITiledMap, tileX: number, tileY: number): TileCoordinates {
    const offset = getTileGridOffset(map);
    return {
        x: offset.x + tileX * (map.tilewidth ?? 32),
        y: offset.y + tileY * (map.tileheight ?? 32),
    };
}

export function tileToWorldCenter(map: ITiledMap, tileX: number, tileY: number): TileCoordinates {
    const topLeft = tileToWorldTopLeft(map, tileX, tileY);
    return {
        x: topLeft.x + (map.tilewidth ?? 32) / 2,
        y: topLeft.y + (map.tileheight ?? 32) / 2,
    };
}

export function worldToMapIndex(map: ITiledMap, worldX: number, worldY: number): TileCoordinates {
    const tile = worldToTileCoordinates(map, worldX, worldY);
    const bounds = getMapTileBounds(map);
    return { x: tile.x - bounds.minX, y: tile.y - bounds.minY };
}

export function mapIndexToTileCoordinates(map: ITiledMap, x: number, y: number): TileCoordinates {
    const bounds = getMapTileBounds(map);
    return { x: bounds.minX + x, y: bounds.minY + y };
}

export function getTileLayerWorldOrigin(map: ITiledMap, layer: TileLayer): TileCoordinates {
    if (isCenteredMap(map)) {
        const offset = getTileGridOffset(map);
        return {
            x: offset.x + (layer.startx ?? 0) * (map.tilewidth ?? 32),
            y: offset.y + (layer.starty ?? 0) * (map.tileheight ?? 32),
        };
    }
    return {
        x: (layer.x ?? 0) * (map.tilewidth ?? 32) + (layer.offsetx ?? 0),
        y: (layer.y ?? 0) * (map.tileheight ?? 32) + (layer.offsety ?? 0),
    };
}

export function tileToLayerIndex(layer: TileLayer, tileX: number, tileY: number): TileCoordinates {
    return { x: tileX - (layer.startx ?? 0), y: tileY - (layer.starty ?? 0) };
}

export function layerIndexToTileCoordinates(layer: TileLayer, x: number, y: number): TileCoordinates {
    return { x: (layer.startx ?? 0) + x, y: (layer.starty ?? 0) + y };
}

export function getTileLayerGid(layer: TileLayer, tileX: number, tileY: number): number {
    if (layer.chunks !== undefined) {
        for (const chunk of layer.chunks) {
            if (tileX < chunk.x || tileY < chunk.y || tileX >= chunk.x + chunk.width || tileY >= chunk.y + chunk.height)
                continue;
            if (!Array.isArray(chunk.data)) return 0;
            return chunk.data[(tileY - chunk.y) * chunk.width + tileX - chunk.x] ?? 0;
        }
        return 0;
    }
    if (!Array.isArray(layer.data)) return 0;
    const local = tileToLayerIndex(layer, tileX, tileY);
    if (local.x < 0 || local.y < 0 || local.x >= layer.width || local.y >= layer.height) return 0;
    return layer.data[local.y * layer.width + local.x] ?? 0;
}

export function setCenteredTileLayerGid(
    map: ITiledMap,
    layer: TileLayer,
    tileX: number,
    tileY: number,
    gid: number,
): boolean {
    if (!isCenteredMap(map) || map.infinite !== true || layer.chunks === undefined) {
        throw new Error("Terrain can only be changed on a centered infinite tile layer");
    }
    const bucket = getChunkBucket(map, tileX, tileY);
    let chunk = layer.chunks.find((candidate) => candidate.x === bucket.x && candidate.y === bucket.y);
    if (chunk === undefined) {
        if (gid === 0) return false;
        chunk = createWritableChunk(map, tileX, tileY);
        layer.chunks.push(chunk);
        layer.chunks.sort((left, right) => left.y - right.y || left.x - right.x);
    } else if (!Array.isArray(chunk.data)) {
        throw new Error(`Tile layer ${layer.name} uses an unsupported encoded chunk`);
    }
    const isInsideChunk =
        tileX >= chunk.x && tileY >= chunk.y && tileX < chunk.x + chunk.width && tileY < chunk.y + chunk.height;
    if (!isInsideChunk && gid === 0) return false;
    expandChunkToInclude(chunk, tileX, tileY);
    const index = (tileY - chunk.y) * chunk.width + tileX - chunk.x;
    const data = chunk.data;
    if (!Array.isArray(data)) throw new Error("Encoded tile chunks cannot be edited");
    if (data[index] === gid) return false;
    data[index] = gid;
    return true;
}

export function forEachTileInLayer(
    layer: TileLayer,
    callback: (gid: number, tileX: number, tileY: number) => void,
): void {
    if (layer.chunks !== undefined) {
        for (const chunk of layer.chunks) {
            if (!Array.isArray(chunk.data)) continue;
            for (let y = 0; y < chunk.height; y += 1) {
                for (let x = 0; x < chunk.width; x += 1) {
                    callback(chunk.data[y * chunk.width + x] ?? 0, chunk.x + x, chunk.y + y);
                }
            }
        }
        return;
    }
    if (!Array.isArray(layer.data)) return;
    const startX = layer.startx ?? layer.x ?? 0;
    const startY = layer.starty ?? layer.y ?? 0;
    for (let y = 0; y < layer.height; y += 1) {
        for (let x = 0; x < layer.width; x += 1) {
            callback(layer.data[y * layer.width + x] ?? 0, startX + x, startY + y);
        }
    }
}

export function materializeTileLayerData(layer: TileLayer): number[] {
    const data = Array<number>(Math.max(0, layer.width * layer.height)).fill(0);
    const startX = layer.startx ?? layer.x ?? 0;
    const startY = layer.starty ?? layer.y ?? 0;
    forEachTileInLayer(layer, (gid, tileX, tileY) => {
        const x = tileX - startX;
        const y = tileY - startY;
        if (x >= 0 && y >= 0 && x < layer.width && y < layer.height) data[y * layer.width + x] = gid;
    });
    return data;
}

export function synchronizeCenteredMapBounds(map: ITiledMap): TileBounds {
    if (!isCenteredMap(map) || map.infinite !== true) throw new Error("Expected a centered infinite map");
    const tileLayers = flattenTileLayers(map.layers);
    const chunkBounds = tileLayers.flatMap((layer) => {
        const bounds = getChunkBounds(layer.chunks);
        return bounds === undefined ? [] : [bounds];
    });
    if (chunkBounds.length === 0) throw new Error("A centered map needs at least one tile chunk");
    const bounds = createTileBounds(
        Math.min(...chunkBounds.map((candidate) => candidate.minX)),
        Math.min(...chunkBounds.map((candidate) => candidate.minY)),
        Math.max(...chunkBounds.map((candidate) => candidate.maxX)),
        Math.max(...chunkBounds.map((candidate) => candidate.maxY)),
    );
    map.width = bounds.width;
    map.height = bounds.height;
    for (const layer of tileLayers) {
        layer.startx = bounds.minX;
        layer.starty = bounds.minY;
        layer.width = bounds.width;
        layer.height = bounds.height;
        layer.x = 0;
        layer.y = 0;
        layer.data = [];
    }
    return bounds;
}

export function flattenTileLayers(layers: readonly ITiledMapLayer[]): TileLayer[] {
    return layers.flatMap((layer) =>
        layer.type === "group" ? flattenTileLayers(layer.layers) : layer.type === "tilelayer" ? [layer] : [],
    );
}

function centreLayers(
    layers: ITiledMapLayer[],
    geometry: {
        width: number;
        height: number;
        startX: number;
        startY: number;
        centreX: number;
        centreY: number;
        tileWidth: number;
        tileHeight: number;
        tileOffsetX: number;
        tileOffsetY: number;
    },
): void {
    for (const layer of layers) {
        if (layer.type === "group") {
            if ((layer.offsetx ?? 0) !== 0 || (layer.offsety ?? 0) !== 0) {
                throw new Error("Centered maps require unshifted layer groups");
            }
            centreLayers(layer.layers, geometry);
            continue;
        }
        if (layer.type === "tilelayer") {
            if (
                !Array.isArray(layer.data) ||
                layer.width !== geometry.width ||
                layer.height !== geometry.height ||
                (layer.x ?? 0) !== 0 ||
                (layer.y ?? 0) !== 0 ||
                (layer.offsetx ?? 0) !== 0 ||
                (layer.offsety ?? 0) !== 0
            ) {
                throw new Error("Centered maps require aligned, unencoded finite tile layers at creation time");
            }
            layer.chunks = chunkFiniteLayer(layer.data, geometry);
            layer.data = [];
            layer.startx = geometry.startX;
            layer.starty = geometry.startY;
            layer.offsetx = geometry.tileOffsetX;
            layer.offsety = geometry.tileOffsetY;
            continue;
        }
        if (layer.type === "objectgroup") {
            for (const object of layer.objects) {
                object.x -= geometry.centreX;
                object.y -= geometry.centreY;
            }
            continue;
        }
        if (layer.type === "imagelayer") {
            layer.x = (layer.x ?? 0) - geometry.centreX;
            layer.y = (layer.y ?? 0) - geometry.centreY;
        }
    }
}

function chunkFiniteLayer(
    data: number[],
    geometry: { width: number; height: number; startX: number; startY: number },
): TileChunk[] {
    const chunks: TileChunk[] = [];
    for (let sourceY = 0; sourceY < geometry.height; sourceY += CENTERED_TILE_CHUNK_SIZE) {
        const height = Math.min(CENTERED_TILE_CHUNK_SIZE, geometry.height - sourceY);
        for (let sourceX = 0; sourceX < geometry.width; sourceX += CENTERED_TILE_CHUNK_SIZE) {
            const width = Math.min(CENTERED_TILE_CHUNK_SIZE, geometry.width - sourceX);
            const chunkData = Array<number>(width * height).fill(0);
            for (let y = 0; y < height; y += 1) {
                for (let x = 0; x < width; x += 1) {
                    chunkData[y * width + x] = data[(sourceY + y) * geometry.width + sourceX + x] ?? 0;
                }
            }
            chunks.push({
                x: geometry.startX + sourceX,
                y: geometry.startY + sourceY,
                width,
                height,
                data: chunkData,
            });
        }
    }
    return chunks;
}

function createWritableChunk(map: ITiledMap, tileX: number, tileY: number): TileChunk {
    const { x, y } = getChunkBucket(map, tileX, tileY);
    const width = tileX - x + 1;
    const height = tileY - y + 1;
    return { x, y, width, height, data: Array<number>(width * height).fill(0) };
}

function getChunkBucket(map: ITiledMap, tileX: number, tileY: number): TileCoordinates {
    const originX = getNumericMapProperty(map, CENTERED_CHUNK_ORIGIN_X_PROPERTY);
    const originY = getNumericMapProperty(map, CENTERED_CHUNK_ORIGIN_Y_PROPERTY);
    const x = originX + Math.floor((tileX - originX) / CENTERED_TILE_CHUNK_SIZE) * CENTERED_TILE_CHUNK_SIZE;
    const y = originY + Math.floor((tileY - originY) / CENTERED_TILE_CHUNK_SIZE) * CENTERED_TILE_CHUNK_SIZE;
    return { x, y };
}

function expandChunkToInclude(chunk: TileChunk, tileX: number, tileY: number): void {
    if (!Array.isArray(chunk.data)) throw new Error("Encoded tile chunks cannot be edited");
    const width = Math.max(chunk.width, tileX - chunk.x + 1);
    const height = Math.max(chunk.height, tileY - chunk.y + 1);
    if (width === chunk.width && height === chunk.height) return;
    if (width > CENTERED_TILE_CHUNK_SIZE || height > CENTERED_TILE_CHUNK_SIZE) {
        throw new Error("A terrain chunk exceeded the centered chunk grid");
    }
    const data = Array<number>(width * height).fill(0);
    for (let y = 0; y < chunk.height; y += 1) {
        for (let x = 0; x < chunk.width; x += 1) data[y * width + x] = chunk.data[y * chunk.width + x] ?? 0;
    }
    chunk.width = width;
    chunk.height = height;
    chunk.data = data;
}

function getChunkBounds(chunks: TileLayer["chunks"]): TileBounds | undefined {
    if (chunks === undefined || chunks.length === 0) return undefined;
    return createTileBounds(
        Math.min(...chunks.map((chunk) => chunk.x)),
        Math.min(...chunks.map((chunk) => chunk.y)),
        Math.max(...chunks.map((chunk) => chunk.x + chunk.width)),
        Math.max(...chunks.map((chunk) => chunk.y + chunk.height)),
    );
}

function createTileBounds(minX: number, minY: number, maxX: number, maxY: number): TileBounds {
    return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function getMapProperty(map: ITiledMap, name: string): ITiledMapProperty["value"] | undefined {
    return map.properties?.find((property) => property.name === name)?.value;
}

function getNumericMapProperty(map: ITiledMap, name: string): number {
    const value = getMapProperty(map, name);
    if (typeof value !== "number") throw new Error(`Centered map property ${name} is missing`);
    return value;
}

function setMapProperty(map: ITiledMap, name: string, type: "string" | "int" | "float", value: string | number): void {
    map.properties ??= [];
    const propertyIndex = map.properties.findIndex((candidate) => candidate.name === name);
    if (propertyIndex === -1) {
        map.properties.push({ name, type, value } as ITiledMapProperty);
        return;
    }
    map.properties[propertyIndex] = { name, type, value } as ITiledMapProperty;
}
