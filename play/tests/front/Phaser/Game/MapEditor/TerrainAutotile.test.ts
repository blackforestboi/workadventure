import { describe, expect, it } from "vitest";

import {
    createTerrainAutotileRegion,
    createTerrainTileRegion,
    normalizeTerrainRectangle,
    translateTerrainAutotileTiles,
    type TerrainAutotileTiles,
} from "../../../../../src/common/Teapot/TerrainAutotile";

const tiles: TerrainAutotileTiles = {
    topLeft: 1,
    top: 2,
    topRight: 3,
    left: 4,
    center: 5,
    right: 6,
    bottomLeft: 7,
    bottom: 8,
    bottomRight: 9,
};

describe("terrain rectangle auto-tiling", () => {
    it.each([
        ["one cell", { x: 2, y: 3 }, { x: 2, y: 3 }, [5]],
        ["vertical strip", { x: 2, y: 1 }, { x: 2, y: 3 }, [2, 5, 8]],
        ["horizontal strip", { x: 1, y: 2 }, { x: 3, y: 2 }, [4, 5, 6]],
        ["two by two", { x: 1, y: 1 }, { x: 2, y: 2 }, [1, 3, 7, 9]],
        ["three by three", { x: 1, y: 1 }, { x: 3, y: 3 }, [1, 2, 3, 4, 5, 6, 7, 8, 9]],
    ])("creates a deterministic %s", (_name, start, end, gids) => {
        expect(createTerrainAutotileRegion("floor", start, end, tiles)).toMatchObject({ layer: "floor", gids });
    });

    it("normalizes reverse drags and repeats edge and center roles", () => {
        expect(normalizeTerrainRectangle({ x: 4, y: 3 }, { x: 1, y: 1 })).toEqual({
            x: 1,
            y: 1,
            width: 4,
            height: 3,
        });
        expect(createTerrainAutotileRegion("floor", { x: 4, y: 3 }, { x: 1, y: 1 }, tiles)).toEqual({
            layer: "floor",
            x: 1,
            y: 1,
            width: 4,
            height: 3,
            gids: [1, 2, 2, 3, 4, 5, 5, 6, 7, 8, 8, 9],
        });
    });

    it("fills every cell of a normalized tile rectangle with the selected GID", () => {
        expect(createTerrainTileRegion("floor", { x: 4, y: 3 }, { x: 1, y: 1 }, 42)).toEqual({
            layer: "floor",
            x: 1,
            y: 1,
            width: 4,
            height: 3,
            gids: [42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42, 42],
        });
    });

    it("fills a tile rectangle with zero when the eraser is selected", () => {
        expect(createTerrainTileRegion("floor", { x: 1, y: 1 }, { x: 2, y: 2 }, 0)).toMatchObject({
            width: 2,
            height: 2,
            gids: [0, 0, 0, 0],
        });
    });

    it("translates local atlas IDs into map GIDs", () => {
        expect(translateTerrainAutotileTiles(tiles, 100)).toEqual({
            topLeft: 101,
            top: 102,
            topRight: 103,
            left: 104,
            center: 105,
            right: 106,
            bottomLeft: 107,
            bottom: 108,
            bottomRight: 109,
        });
    });
});
