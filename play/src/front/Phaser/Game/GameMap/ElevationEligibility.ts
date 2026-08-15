import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";

import { getBuiltInTerrainAsset, getBuiltInTerrainTileset } from "../../../Services/BuiltInTerrainCatalog";

const TILED_TILE_FLIP_FLAGS = 0xe0000000;

export function layerHasElevatableTerrain(map: ITiledMap, layerName: string): boolean {
    const layer = flattenLayers(map.layers).find((candidate) => candidate.name === layerName);
    if (layer?.type !== "tilelayer") return false;
    if (Array.isArray(layer.data) && layer.data.some((gid) => isElevatableTerrainGid(map, gid))) return true;
    return (
        layer.chunks?.some(
            (chunk) => Array.isArray(chunk.data) && chunk.data.some((gid) => isElevatableTerrainGid(map, gid)),
        ) ?? false
    );
}

export function isElevatableTerrainGid(map: ITiledMap, rawGid: number): boolean {
    const gid = rawGid & ~TILED_TILE_FLIP_FLAGS;
    if (gid <= 0) return false;
    const tilesets = map.tilesets
        .filter((tileset) => typeof tileset.firstgid === "number")
        .sort((left, right) => (left.firstgid ?? 0) - (right.firstgid ?? 0));
    const tileset = [...tilesets].reverse().find((candidate) => (candidate.firstgid ?? 0) <= gid);
    if (
        tileset?.firstgid === undefined ||
        !("image" in tileset) ||
        typeof tileset.image !== "string" ||
        getBuiltInTerrainTileset(tileset.image) === undefined
    ) {
        return false;
    }
    const terrainType = getBuiltInTerrainAsset(gid - tileset.firstgid)?.terrainType;
    return terrainType !== undefined && terrainType !== "water" && terrainType !== "lava" && terrainType !== "void";
}

function flattenLayers(layers: readonly ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => [layer, ...(layer.type === "group" ? flattenLayers(layer.layers) : [])]);
}
