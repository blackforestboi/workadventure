import { type ITiledMap, type ITiledMapLayer, ITiledMapTileset } from "@workadventure/tiled-map-type-guard";

import { forEachTileInLayer } from "../GameMap/CenteredMapCoordinates";
import { applyTeapotTilePatch, TeapotTilePatch, type TeapotTileRegion } from "./TeapotTilePatch";

const MAX_TILESET_JSON_BYTES = 64 * 1024;

export interface TeapotTerrainMutation {
    mapId: string;
    regions: readonly TeapotTileRegion[];
    tilesetJson?: string;
    removeTileset?: boolean;
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
    if (hasRegions === hasTileset) throw new Error("A terrain edit must contain either tiles or one tileset change");

    if (hasRegions) {
        return applyTeapotTilePatch(
            source,
            TeapotTilePatch.parse({
                mapId: mutation.mapId,
                expectedRevision: 0,
                regions: mutation.regions,
            }),
        ).map;
    }

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
