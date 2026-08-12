import { describe, expect, it } from "vitest";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { createCenteredMap } from "@workadventure/map-editor";
import {
    canExpandMap,
    canUseGpuTilemapRenderer,
} from "../../../../../src/front/Phaser/Game/GameMap/TilemapRendererSelection";

function createMap(): ITiledMap {
    return createCenteredMap({
        orientation: "orthogonal",
        infinite: false,
        width: 1,
        height: 1,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            { id: 1, name: "floor", type: "tilelayer", width: 1, height: 1, data: [1], opacity: 1, visible: true },
        ],
        tilesets: [],
    } as unknown as ITiledMap);
}

describe("tilemap renderer selection", () => {
    it("keeps a centered infinite map expandable after a scene rebuild", () => {
        expect(canExpandMap(createMap())).toBe(true);
    });

    it("does not infer expandability from the map editor UI for ordinary maps", () => {
        const map = createMap();
        map.infinite = false;

        expect(canExpandMap(map)).toBe(false);
    });

    it("keeps expandable maps on the renderer that supports a changing origin", () => {
        expect(canUseGpuTilemapRenderer({}, 32, 32, true)).toBe(false);
    });

    it("rejects GPU rendering for an existing pixel offset", () => {
        expect(canUseGpuTilemapRenderer({ offsetx: -512, offsety: -416 }, 32, 32, false)).toBe(false);
    });

    it("rejects GPU rendering for an existing tile offset", () => {
        expect(canUseGpuTilemapRenderer({ x: -2, y: 1 }, 32, 32, false)).toBe(false);
    });

    it("allows GPU rendering for a fixed layer at the world origin", () => {
        expect(canUseGpuTilemapRenderer({}, 32, 32, false)).toBe(true);
    });
});
