import { type ITiledMap, type ITiledMapLayer, ITiledMapTileset } from "@workadventure/tiled-map-type-guard";

import { applyTeapotTilePatch, TeapotTilePatch, type TeapotTileRegion } from "./TeapotTilePatch";

const MAX_TILESET_JSON_BYTES = 64 * 1024;

export interface TeapotTerrainMutation {
    mapId: string;
    regions: readonly TeapotTileRegion[];
    tilesetJson?: string;
    removeTileset?: boolean;
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
    return flattenLayers(map.layers).some(
        (layer) =>
            layer.type === "tilelayer" &&
            Array.isArray(layer.data) &&
            layer.data.some((gid) => {
                const unflippedGid = gid & 0x1fffffff;
                return unflippedGid >= firstGid && unflippedGid < nextFirstGid;
            }),
    );
}

function flattenLayers(layers: ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => [layer, ...(layer.type === "group" ? flattenLayers(layer.layers) : [])]);
}
