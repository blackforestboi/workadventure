import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    RESIDENT_TILE_WINDOW_SIZE,
    getResidentTileWindow,
    residentTileWindowNeedsRecentering,
    shouldUseResidentTileWindow,
} from "../../../../../src/front/Phaser/Game/GameMap/ResidentTileWindow";

describe("ResidentTileWindow", () => {
    it("activates for a chunked 4000 by 4000 world but not a small map", () => {
        expect(shouldUseResidentTileWindow(createMap(4_000, 4_000))).toBe(true);
        expect(shouldUseResidentTileWindow(createMap(250, 250))).toBe(false);
    });

    it("does not opt dense or non-infinite maps into a path that cannot project them cheaply", () => {
        const finite = createMap(4_000, 4_000);
        finite.infinite = false;
        expect(shouldUseResidentTileWindow(finite)).toBe(false);

        const dense = createMap(4_000, 4_000);
        const layer = dense.layers[0];
        if (layer?.type !== "tilelayer") throw new Error("Expected tile layer");
        delete layer.chunks;
        layer.data = [];
        expect(shouldUseResidentTileWindow(dense)).toBe(false);
    });

    it("creates a five-chunk signed window and clips it at world edges", () => {
        const map = createMap(4_000, 4_000, -2_000, -2_000);

        expect(getResidentTileWindow(map, { x: 0, y: 0 })).toEqual({
            x: -128,
            y: -128,
            width: RESIDENT_TILE_WINDOW_SIZE,
            height: RESIDENT_TILE_WINDOW_SIZE,
        });
        expect(getResidentTileWindow(map, { x: -2_000, y: -2_000 })).toEqual({
            x: -2_000,
            y: -2_000,
            width: RESIDENT_TILE_WINDOW_SIZE,
            height: RESIDENT_TILE_WINDOW_SIZE,
        });
        expect(getResidentTileWindow(map, { x: 1_999, y: 1_999 })).toEqual({
            x: 2_000 - RESIDENT_TILE_WINDOW_SIZE,
            y: 2_000 - RESIDENT_TILE_WINDOW_SIZE,
            width: RESIDENT_TILE_WINDOW_SIZE,
            height: RESIDENT_TILE_WINDOW_SIZE,
        });
    });

    it("recentres only after the focus leaves the central safety area", () => {
        const resident = { x: -128, y: -128, width: 320, height: 320 };

        expect(residentTileWindowNeedsRecentering(resident, { x: 0, y: 0 })).toBe(false);
        expect(residentTileWindowNeedsRecentering(resident, { x: -65, y: 0 })).toBe(true);
        expect(residentTileWindowNeedsRecentering(resident, { x: 128, y: 0 })).toBe(true);
    });
});

function createMap(width: number, height: number, startx = 0, starty = 0): ITiledMap {
    const layer: ITiledMapLayer = {
        id: 1,
        name: "ground",
        type: "tilelayer",
        opacity: 1,
        visible: true,
        startx,
        starty,
        width,
        height,
        data: [],
        chunks: [{ x: startx, y: starty, width: 1, height: 1, data: [1] }],
    };
    return {
        type: "map",
        tiledversion: "1.10.2",
        orientation: "orthogonal",
        infinite: true,
        width,
        height,
        tilewidth: 32,
        tileheight: 32,
        layers: [layer],
        tilesets: [],
    };
}
