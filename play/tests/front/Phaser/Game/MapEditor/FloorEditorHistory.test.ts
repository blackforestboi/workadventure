import { applyTeapotTilePatch, TeapotTilePatch } from "@workadventure/map-editor";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import { createFloorEdit } from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorHistory";

const map = {
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

describe("createFloorEdit", () => {
    it("builds an inverse patch that restores the edited tiles", () => {
        const forward = TeapotTilePatch.parse({
            mapId: "https://example.com/map.tmj",
            expectedRevision: 1,
            regions: [{ layer: "floor", x: 0, y: 0, width: 2, height: 1, gids: [8, 9] }],
        });
        const edit = createFloorEdit(map, forward);

        expect(edit).toBeDefined();
        const changed = applyTeapotTilePatch(map, edit!.forward).map;
        const restored = applyTeapotTilePatch(changed, edit!.backward).map;
        expect((restored.layers[0] as { data: number[] }).data).toEqual([1, 2, 3, 4]);
    });

    it("does not add no-op paint operations to history", () => {
        const patch = TeapotTilePatch.parse({
            mapId: "https://example.com/map.tmj",
            expectedRevision: 1,
            regions: [{ layer: "floor", x: 0, y: 0, width: 1, height: 1, gids: [1] }],
        });
        expect(createFloorEdit(map, patch)).toBeUndefined();
    });
});
