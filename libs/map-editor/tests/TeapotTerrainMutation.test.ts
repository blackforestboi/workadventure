import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import { applyTeapotTerrainMutation } from "../src/Authoring/TeapotTerrainMutation";

const sourceMap = {
    orientation: "orthogonal",
    infinite: false,
    width: 2,
    height: 2,
    tilewidth: 32,
    tileheight: 32,
    layers: [{ id: 1, name: "floor", type: "tilelayer", width: 2, height: 2, data: [1, 2, 3, 4] }],
    tilesets: [
        {
            firstgid: 1,
            name: "terrain",
            image: "terrain.png",
            imagewidth: 320,
            imageheight: 32,
            tilewidth: 32,
            tileheight: 32,
            tilecount: 10,
            columns: 10,
            margin: 0,
            spacing: 0,
        },
    ],
} as unknown as ITiledMap;

describe("applyTeapotTerrainMutation", () => {
    it("applies a live tile patch", () => {
        const updated = applyTeapotTerrainMutation(sourceMap, {
            mapId: "https://example.com/map.tmj",
            regions: [{ layer: "floor", x: 0, y: 0, width: 1, height: 1, gids: [8] }],
        });

        expect((updated.layers[0] as { data: number[] }).data).toEqual([8, 2, 3, 4]);
        expect((sourceMap.layers[0] as { data: number[] }).data).toEqual([1, 2, 3, 4]);
    });

    it("adds and removes an embedded tileset", () => {
        const tileset = {
            firstgid: 11,
            name: "generated",
            image: "generated.png",
            imagewidth: 32,
            imageheight: 32,
            tilewidth: 32,
            tileheight: 32,
            tilecount: 1,
            columns: 1,
            margin: 0,
            spacing: 0,
        };
        const added = applyTeapotTerrainMutation(sourceMap, {
            mapId: "https://example.com/map.tmj",
            regions: [],
            tilesetJson: JSON.stringify(tileset),
        });
        const removed = applyTeapotTerrainMutation(added, {
            mapId: "https://example.com/map.tmj",
            regions: [],
            tilesetJson: JSON.stringify(tileset),
            removeTileset: true,
        });

        expect(added.tilesets).toHaveLength(2);
        expect(removed.tilesets).toEqual(sourceMap.tilesets);
    });
});
