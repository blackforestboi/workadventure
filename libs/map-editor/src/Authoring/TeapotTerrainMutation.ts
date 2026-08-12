import {
    type ITiledMap,
    ITiledMapLayer,
    type ITiledMapLayer as TiledMapLayer,
    ITiledMapTileset,
} from "@workadventure/tiled-map-type-guard";

import { forEachTileInLayer } from "../GameMap/CenteredMapCoordinates";
import { applyElevationUpdates, type TeapotElevationUpdate } from "./ElevationTerrain";
import { applyTeapotTilePatch, TeapotTilePatch, type TeapotTileRegion } from "./TeapotTilePatch";

const MAX_TILESET_JSON_BYTES = 64 * 1024;
const MAX_LAYER_JSON_BYTES = 64 * 1024;

export const WATER_UNDERLAY_LAYER_PREFIX = "__teapot_water_underlay__";

export interface TeapotTerrainMutation {
    mapId: string;
    regions: readonly TeapotTileRegion[];
    tilesetJson?: string;
    removeTileset?: boolean;
    layerJson?: string;
    removeLayer?: boolean;
    beforeLayer?: string;
    elevationUpdates?: readonly TeapotElevationUpdate[];
}

export interface TerrainTileCoordinate {
    x: number;
    y: number;
}

const NON_VISUAL_TERRAIN_LAYER_NAMES = new Set([
    "collision",
    "collisions",
    "collision1",
    "collisions1",
    "collision2",
    "collisions2",
    "exit",
    "start",
    "start1",
]);

/** Returns whether a persisted tile layer can provide visible floor support for an avatar. */
export function isAvatarSupportingTileLayerName(layerName: string): boolean {
    return !layerName.startsWith("__") && !NON_VISUAL_TERRAIN_LAYER_NAMES.has(normalizeLayerName(layerName));
}

/** Detects a zero-GID write to a visual tile layer at any occupied tile coordinate. */
export function containsOccupiedVisualTileDeletion(
    regions: readonly TeapotTileRegion[],
    occupiedCells: readonly TerrainTileCoordinate[],
): boolean {
    const occupied = new Set(occupiedCells.map(({ x, y }) => `${x},${y}`));
    if (occupied.size === 0) return false;

    return regions.some((region) => {
        if (!isAvatarSupportingTileLayerName(region.layer)) return false;
        for (let y = 0; y < region.height; y += 1) {
            for (let x = 0; x < region.width; x += 1) {
                if ((region.gids[y * region.width + x] ?? 0) !== 0) continue;
                if (occupied.has(`${region.x + x},${region.y + y}`)) return true;
            }
        }
        return false;
    });
}

export function applyTeapotTerrainMutation(source: ITiledMap, mutation: TeapotTerrainMutation): ITiledMap {
    const hasRegions = mutation.regions.length > 0;
    const hasTileset = mutation.tilesetJson !== undefined && mutation.tilesetJson !== "";
    const hasLayer = mutation.layerJson !== undefined && mutation.layerJson !== "";
    const hasElevationUpdates = mutation.elevationUpdates !== undefined && mutation.elevationUpdates.length > 0;
    if (hasTileset && (hasRegions || hasLayer || hasElevationUpdates))
        throw new Error("A tileset edit cannot contain tile, layer, or elevation changes");
    if (!hasRegions && !hasTileset && !hasLayer && !hasElevationUpdates)
        throw new Error("A terrain edit must contain tiles, a layer, or a tileset");

    if (hasTileset) return applyTilesetMutation(source, mutation);

    let map = hasLayer ? structuredClone(source) : source;
    if (hasLayer && !mutation.removeLayer) map = addTerrainLayer(map, mutation.layerJson!, mutation.beforeLayer);
    if (hasRegions) {
        map = applyTeapotTilePatch(
            map,
            TeapotTilePatch.parse({
                mapId: mutation.mapId,
                expectedRevision: 0,
                regions: mutation.regions,
            }),
        ).map;
    }
    if (hasElevationUpdates) map = applyElevationUpdates(map, mutation.elevationUpdates!);
    if (hasLayer && mutation.removeLayer) map = removeTerrainLayer(map, mutation.layerJson!);
    return map;
}

function applyTilesetMutation(source: ITiledMap, mutation: TeapotTerrainMutation): ITiledMap {
    if (mutation.tilesetJson!.length > MAX_TILESET_JSON_BYTES) throw new Error("The terrain tileset is too large");
    const tileset = ITiledMapTileset.parse(JSON.parse(mutation.tilesetJson!));
    if (typeof tileset.firstgid !== "number") throw new Error("The terrain tileset is invalid");

    const map = structuredClone(source);
    const existingIndex = map.tilesets.findIndex((candidate) => candidate.firstgid === tileset.firstgid);
    if (mutation.removeTileset) {
        if (existingIndex === -1) return map;
        if (terrainUsesTileset(map, existingIndex)) throw new Error("Undo painted tiles before removing their tileset");
        map.tilesets.splice(existingIndex, 1);
    } else if (existingIndex === -1) {
        map.tilesets.push(tileset);
        map.tilesets.sort((left, right) => (left.firstgid ?? 0) - (right.firstgid ?? 0));
    } else if (JSON.stringify(map.tilesets[existingIndex]) !== JSON.stringify(tileset)) {
        throw new Error(`A different tileset already starts at GID ${tileset.firstgid}`);
    }
    return map;
}

export function createWaterUnderlayLayer(map: ITiledMap, coverLayerName: string): TiledMapLayer {
    const cover = flattenLayers(map.layers).find((layer) => layer.name === coverLayerName);
    if (cover?.type !== "tilelayer") throw new Error(`Terrain layer ${coverLayerName} does not exist`);
    const id = Math.max(map.nextlayerid ?? 1, ...flattenLayers(map.layers).map((layer) => (layer.id ?? 0) + 1));
    const common = {
        id,
        name: waterUnderlayLayerName(coverLayerName),
        type: "tilelayer" as const,
        opacity: 1,
        visible: true,
        width: cover.width,
        height: cover.height,
        x: cover.x ?? 0,
        y: cover.y ?? 0,
        startx: cover.startx,
        starty: cover.starty,
        offsetx: cover.offsetx,
        offsety: cover.offsety,
        parallaxx: cover.parallaxx,
        parallaxy: cover.parallaxy,
        properties: [{ name: "teapot:underlayFor", type: "string" as const, value: coverLayerName }],
    };
    return ITiledMapLayer.parse(
        map.infinite === true || cover.chunks !== undefined
            ? { ...common, data: [], chunks: [] }
            : { ...common, data: Array<number>(cover.width * cover.height).fill(0) },
    );
}

export function waterUnderlayLayerName(coverLayerName: string): string {
    return `${WATER_UNDERLAY_LAYER_PREFIX}${encodeURIComponent(coverLayerName)}`;
}

export function waterUnderlayCoverLayerName(layerName: string): string | undefined {
    if (!layerName.startsWith(WATER_UNDERLAY_LAYER_PREFIX)) return undefined;
    try {
        return decodeURIComponent(layerName.slice(WATER_UNDERLAY_LAYER_PREFIX.length));
    } catch {
        return undefined;
    }
}

function addTerrainLayer(map: ITiledMap, layerJson: string, beforeLayerName?: string): ITiledMap {
    if (layerJson.length > MAX_LAYER_JSON_BYTES) throw new Error("The terrain layer is too large");
    const layer = ITiledMapLayer.parse(JSON.parse(layerJson));
    if (layer.id === undefined) throw new Error("The terrain layer is invalid");
    const existing = flattenLayers(map.layers).find((candidate) => candidate.name === layer.name);
    if (existing !== undefined) {
        if (JSON.stringify(existing) !== JSON.stringify(layer))
            throw new Error(`A different layer is named ${layer.name}`);
        return map;
    }
    if (beforeLayerName === undefined || !insertLayerBefore(map.layers, layer, beforeLayerName)) map.layers.push(layer);
    map.nextlayerid = Math.max(map.nextlayerid ?? 1, layer.id + 1);
    return map;
}

function removeTerrainLayer(map: ITiledMap, layerJson: string): ITiledMap {
    if (layerJson.length > MAX_LAYER_JSON_BYTES) throw new Error("The terrain layer is too large");
    const layer = ITiledMapLayer.parse(JSON.parse(layerJson));
    removeLayerNamed(map.layers, layer.name);
    return map;
}

function insertLayerBefore(layers: TiledMapLayer[], layer: TiledMapLayer, beforeLayerName: string): boolean {
    const index = layers.findIndex((candidate) => candidate.name === beforeLayerName);
    if (index !== -1) {
        layers.splice(index, 0, layer);
        return true;
    }
    return layers.some(
        (candidate) => candidate.type === "group" && insertLayerBefore(candidate.layers, layer, beforeLayerName),
    );
}

function removeLayerNamed(layers: TiledMapLayer[], layerName: string): boolean {
    const index = layers.findIndex((candidate) => candidate.name === layerName);
    if (index !== -1) {
        layers.splice(index, 1);
        return true;
    }
    return layers.some((candidate) => candidate.type === "group" && removeLayerNamed(candidate.layers, layerName));
}

function terrainUsesTileset(map: ITiledMap, tilesetIndex: number): boolean {
    const firstGid = map.tilesets[tilesetIndex]?.firstgid;
    if (firstGid === undefined) return false;
    const nextFirstGid = map.tilesets[tilesetIndex + 1]?.firstgid ?? Number.POSITIVE_INFINITY;
    return flattenLayers(map.layers).some((layer) => {
        if (layer.type !== "tilelayer") return false;
        let usesTileset = false;
        forEachTileInLayer(layer, (gid) => {
            const unflippedGid = gid & 0x1fffffff;
            if (unflippedGid >= firstGid && unflippedGid < nextFirstGid) usesTileset = true;
        });
        return usesTileset;
    });
}

function flattenLayers(layers: ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => [layer, ...(layer.type === "group" ? flattenLayers(layer.layers) : [])]);
}

function normalizeLayerName(name: string): string {
    return name.toLowerCase().replace(/[\s/_-]+/g, "");
}
