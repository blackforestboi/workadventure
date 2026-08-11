import type { ITiledMapLayer } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    chooseDefaultPaintLayer,
    collectTerrainGids,
    getTerrainTilesetGids,
    resolveBrushLayer,
} from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorCatalog";

function tileLayer(name: string, data: number[]): ITiledMapLayer {
    return { id: 1, name, type: "tilelayer", data, height: 1, width: data.length } as unknown as ITiledMapLayer;
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
});
