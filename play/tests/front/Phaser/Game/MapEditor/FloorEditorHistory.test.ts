import { applyTeapotTilePatch, createCenteredMap, getTileLayerGid, TeapotTilePatch } from "@workadventure/map-editor";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import { createFloorEdit } from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorHistory";

function createMap(): ITiledMap {
    return createCenteredMap({
        orientation: "orthogonal",
        infinite: false,
        width: 2,
        height: 2,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            {
                id: 1,
                name: "floor",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [1, 2, 3, 4],
                opacity: 1,
                visible: true,
            },
        ],
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
    } as unknown as ITiledMap);
}

function floorLayer(map: ITiledMap) {
    const layer = map.layers[0];
    if (layer?.type !== "tilelayer") throw new Error("Expected floor tile layer");
    return layer;
}

describe("createFloorEdit", () => {
    it("builds an inverse patch that restores signed tiles", () => {
        const map = createMap();
        const forward = TeapotTilePatch.parse({
            mapId: "https://example.com/map.tmj",
            expectedRevision: 1,
            regions: [{ layer: "floor", x: -1, y: -1, width: 2, height: 1, gids: [8, 9] }],
        });
        const edit = createFloorEdit(map, forward);

        expect(edit).toBeDefined();
        const changed = applyTeapotTilePatch(map, edit!.forward).map;
        const restored = applyTeapotTilePatch(changed, edit!.backward).map;
        expect(getTileLayerGid(floorLayer(restored), -1, -1)).toBe(1);
        expect(getTileLayerGid(floorLayer(restored), 0, -1)).toBe(2);
    });

    it("does not add no-op paint operations to history", () => {
        const map = createMap();
        const patch = TeapotTilePatch.parse({
            mapId: "https://example.com/map.tmj",
            expectedRevision: 1,
            regions: [{ layer: "floor", x: -1, y: -1, width: 1, height: 1, gids: [1] }],
        });
        expect(createFloorEdit(map, patch)).toBeUndefined();
    });

    it("records empty cells in negative space so expansion can be undone", () => {
        const map = createMap();
        const patch = TeapotTilePatch.parse({
            mapId: "https://example.com/map.tmj",
            expectedRevision: 1,
            regions: [{ layer: "floor", x: -3, y: -2, width: 1, height: 1, gids: [8] }],
        });
        const edit = createFloorEdit(map, patch);

        expect(edit?.backward.regions).toEqual([{ layer: "floor", x: -3, y: -2, width: 1, height: 1, gids: [0] }]);
        const changed = applyTeapotTilePatch(map, edit!.forward).map;
        const restored = applyTeapotTilePatch(changed, edit!.backward).map;
        expect(getTileLayerGid(floorLayer(restored), -3, -2)).toBe(0);
        expect(getTileLayerGid(floorLayer(restored), -1, -1)).toBe(1);
    });
});
