import type { ITiledMapTileLayer } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    chooseDefaultPaintLayer,
    collectTerrainGids,
    findTopmostErasableLayer,
    getTerrainTilesetGids,
    resolveBrushLayer,
} from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorCatalog";

function tileLayer(name: string, data: number[]): ITiledMapTileLayer {
    return {
        id: 1,
        name,
        type: "tilelayer",
        data,
        height: 1,
        width: data.length,
    } as unknown as ITiledMapTileLayer;
}

describe("terrain editor catalog", () => {
    it("uses only tiles painted on explicitly named surface layers", () => {
        const gids = collectTerrainGids([
            tileLayer("floor", [1, 2, 2, 0]),
            tileLayer("walls", [101, 102]),
            tileLayer("furniture", [201, 202]),
        ]);

        expect([...gids]).toEqual([1, 2]);
        expect(getTerrainTilesetGids(1, 100, gids)).toEqual([1, 2]);
        expect(getTerrainTilesetGids(101, 100, gids)).toEqual([]);
        expect(getTerrainTilesetGids(201, 100, gids)).toEqual([]);
    });

    it("always exposes a self-contained single-tile asset", () => {
        expect(getTerrainTilesetGids(301, 1, new Set())).toEqual([301]);
    });

    it("falls back to the first editable tile layer when a map has no conventional floor name", () => {
        const gids = collectTerrainGids([tileLayer("collisions", [99]), tileLayer("bottom", [7, 8])]);

        expect(chooseDefaultPaintLayer(["collisions", "bottom"])).toBe("bottom");
        expect([...gids]).toEqual([7, 8]);
    });

    it("uses the preferred tile layer when selecting a brush from a no-brush state", () => {
        expect(resolveBrushLayer("", ["collisions", "floor", "walls"])).toBe("floor");
        expect(resolveBrushLayer("walls", ["collisions", "floor", "walls"])).toBe("walls");
        expect(resolveBrushLayer("", [])).toBe("");
    });

    it("targets the topmost visible non-system tile when erasing stacked layers", () => {
        const floor = tileLayer("floor", [11, 12]);
        const walls = tileLayer("walls", [0, 101]);
        const collision = tileLayer("collision 1", [201, 202]);

        expect(findTopmostErasableLayer([floor, walls, collision], 0, 0)).toBe("floor");
        expect(findTopmostErasableLayer([floor, walls, collision], 1, 0)).toBe("walls");
        expect(findTopmostErasableLayer([floor, { ...walls, visible: false }, collision], 1, 0)).toBe("floor");
        expect(findTopmostErasableLayer([collision], 1, 0)).toBeUndefined();
    });

    it("reveals the next tile layer after each erase", () => {
        const floor = tileLayer("floor", [11]);
        const walls = tileLayer("walls", [101]);
        const layers = [floor, walls];

        expect(findTopmostErasableLayer(layers, 0, 0)).toBe("walls");
        walls.data = [0];
        expect(findTopmostErasableLayer(layers, 0, 0)).toBe("floor");
        floor.data = [0];
        expect(findTopmostErasableLayer(layers, 0, 0)).toBeUndefined();
    });
});
