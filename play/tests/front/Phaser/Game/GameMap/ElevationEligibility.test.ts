import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    BUILT_IN_SUMMER_TERRAIN_TILESET,
    BUILT_IN_TERRAIN_TILESET,
} from "../../../../../src/front/Services/BuiltInTerrainCatalog";
import {
    isElevatableTerrainGid,
    layerHasElevatableTerrain,
} from "../../../../../src/front/Phaser/Game/GameMap/ElevationEligibility";

function createMap(): ITiledMap {
    const dirtTileId = BUILT_IN_TERRAIN_TILESET.groups.find((group) => group.terrainType === "earth")!.tileIds[0];
    return {
        type: "map",
        tiledversion: "1.10",
        orientation: "orthogonal",
        infinite: false,
        width: 1,
        height: 1,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            { id: 1, name: "dirt", type: "tilelayer", width: 1, height: 1, x: 0, y: 0, data: [1 + dirtTileId] },
            { id: 2, name: "wood", type: "tilelayer", width: 1, height: 1, x: 0, y: 0, data: [2000] },
        ],
        tilesets: [
            {
                firstgid: 1,
                name: "outdoor",
                image: BUILT_IN_TERRAIN_TILESET.image,
                imagewidth: BUILT_IN_TERRAIN_TILESET.width,
                imageheight: BUILT_IN_TERRAIN_TILESET.height,
                tilewidth: 32,
                tileheight: 32,
                tilecount: BUILT_IN_TERRAIN_TILESET.tileCount,
                columns: BUILT_IN_TERRAIN_TILESET.columns,
            },
            {
                firstgid: 2000,
                name: "indoor wood",
                image: "wood-interior.png",
                imagewidth: 32,
                imageheight: 32,
                tilewidth: 32,
                tileheight: 32,
                tilecount: 1,
                columns: 1,
            },
        ],
    } as unknown as ITiledMap;
}

describe("elevation eligibility", () => {
    it("accepts outdoor natural terrain and rejects indoor floor tiles", () => {
        const map = createMap();

        expect(layerHasElevatableTerrain(map, "dirt")).toBe(true);
        expect(layerHasElevatableTerrain(map, "wood")).toBe(false);
        expect(isElevatableTerrainGid(map, 2000)).toBe(false);
    });

    it("accepts non-water Craftpix Summer terrain", () => {
        const map = createMap();
        const firstGid = 3000;
        const meadowTileId = BUILT_IN_SUMMER_TERRAIN_TILESET.groups.find(({ id }) => id === "summer-meadow-texture")!
            .tileIds[0];
        map.tilesets.push({
            firstgid: firstGid,
            name: BUILT_IN_SUMMER_TERRAIN_TILESET.name,
            image: BUILT_IN_SUMMER_TERRAIN_TILESET.image,
            imagewidth: BUILT_IN_SUMMER_TERRAIN_TILESET.width,
            imageheight: BUILT_IN_SUMMER_TERRAIN_TILESET.height,
            tilewidth: 32,
            tileheight: 32,
            tilecount: BUILT_IN_SUMMER_TERRAIN_TILESET.tileCount,
            columns: BUILT_IN_SUMMER_TERRAIN_TILESET.columns,
        });

        expect(isElevatableTerrainGid(map, firstGid + meadowTileId)).toBe(true);
    });
});
