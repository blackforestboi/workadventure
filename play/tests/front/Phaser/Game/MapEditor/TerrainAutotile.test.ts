import { TeapotTilePatch, type TeapotTileRegion } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";

import { getBuiltInTerrainAutotile } from "../../../../../src/common/Teapot/BuiltInTerrainCatalog";
import {
    createLiquidTerrainBrushRegions,
    createMergedTerrainAutotileRegions,
    createTerrainAutotileRegion,
    createTerrainTileRegion,
    createWaterTerrainBrushRegions,
    createWaterTerrainRectangleRegions,
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
    innerTopLeft: 10,
    innerTopRight: 11,
    innerBottomLeft: 12,
    innerBottomRight: 13,
};

function regionTiles(regions: readonly TeapotTileRegion[]): Map<string, number> {
    const result = new Map<string, number>();
    for (const region of regions) {
        for (let y = 0; y < region.height; y += 1) {
            for (let x = 0; x < region.width; x += 1) {
                result.set(`${region.x + x},${region.y + y}`, region.gids[y * region.width + x] ?? 0);
            }
        }
    }
    return result;
}

function regionTilesForLayer(regions: readonly TeapotTileRegion[], layer: string): Map<string, number> {
    return regionTiles(regions.filter((region) => region.layer === layer));
}

function applyTerrainRegions(
    existing: readonly { x: number; y: number; gid: number }[],
    regions: readonly TeapotTileRegion[],
): Map<string, number> {
    const result = new Map(existing.map(({ x, y, gid }) => [`${x},${y}`, gid]));
    for (const [coordinate, gid] of regionTiles(regions)) result.set(coordinate, gid);
    return result;
}

function terrainTiles(terrain: ReadonlyMap<string, number>): { x: number; y: number; gid: number }[] {
    return [...terrain].map(([coordinate, gid]) => {
        const [x, y] = coordinate.split(",").map(Number);
        return { x, y, gid };
    });
}

function regionCellCount(regions: readonly TeapotTileRegion[]): number {
    return regions.reduce((total, region) => total + region.width * region.height, 0);
}

function rectangularTerrain(x: number, y: number, width: number, height: number) {
    const region = createTerrainAutotileRegion("floor", { x, y }, { x: x + width - 1, y: y + height - 1 }, tiles);
    return terrainTiles(regionTiles([region]));
}

describe("terrain rectangle auto-tiling", () => {
    it("resolves the same verified contour for any selected tile in a shape-ready family", () => {
        expect(getBuiltInTerrainAutotile(97)).toMatchObject({ center: 97, topLeft: 64 });
        expect(getBuiltInTerrainAutotile(64)).toMatchObject({ center: 97, topLeft: 64 });
        expect(getBuiltInTerrainAutotile(34)).toMatchObject({ center: 97, innerTopLeft: 34 });
        expect(getBuiltInTerrainAutotile(500)).toBeUndefined();
    });

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
            innerTopLeft: 110,
            innerTopRight: 111,
            innerBottomLeft: 112,
            innerBottomRight: 113,
        });
    });

    it("merges a touching same-family rectangle and removes its internal seam", () => {
        const existing = [
            { x: 0, y: 0, gid: tiles.topLeft },
            { x: 1, y: 0, gid: tiles.topRight },
            { x: 0, y: 1, gid: tiles.bottomLeft },
            { x: 1, y: 1, gid: tiles.bottomRight },
        ];
        const regions = createMergedTerrainAutotileRegions("floor", { x: 2, y: 0 }, { x: 3, y: 1 }, tiles, existing);

        expect([...applyTerrainRegions(existing, regions)]).toEqual([
            ["0,0", tiles.topLeft],
            ["1,0", tiles.top],
            ["0,1", tiles.bottomLeft],
            ["1,1", tiles.bottom],
            ["2,0", tiles.top],
            ["3,0", tiles.topRight],
            ["2,1", tiles.bottom],
            ["3,1", tiles.bottomRight],
        ]);
    });

    it("uses the verified inner-corner variant for a concave merge", () => {
        const regions = createMergedTerrainAutotileRegions("floor", { x: 1, y: 1 }, { x: 1, y: 1 }, tiles, [
            { x: 1, y: 0, gid: tiles.center },
            { x: 2, y: 0, gid: tiles.center },
            { x: 0, y: 1, gid: tiles.center },
            { x: 2, y: 1, gid: tiles.center },
            { x: 0, y: 2, gid: tiles.center },
            { x: 1, y: 2, gid: tiles.center },
            { x: 2, y: 2, gid: tiles.center },
        ]);

        expect(regionTiles(regions).get("1,1")).toBe(tiles.innerTopLeft);
    });

    it("does not retile a separate or different-family field", () => {
        const regions = createMergedTerrainAutotileRegions("floor", { x: 0, y: 0 }, { x: 0, y: 0 }, tiles, [
            { x: 4, y: 0, gid: tiles.center },
            { x: 1, y: 0, gid: 99 },
        ]);

        expect(regions).toEqual([{ layer: "floor", x: 0, y: 0, width: 1, height: 1, gids: [5] }]);
    });

    it("fills a one-cell gap between matching fields and removes the facing edges", () => {
        const existing = [
            { x: 0, y: 0, gid: tiles.left },
            { x: 1, y: 0, gid: tiles.right },
            { x: 3, y: 0, gid: tiles.left },
            { x: 4, y: 0, gid: tiles.right },
        ];
        const regions = createMergedTerrainAutotileRegions("floor", { x: 2, y: 0 }, { x: 2, y: 0 }, tiles, existing);
        const result = applyTerrainRegions(existing, regions);

        expect([0, 1, 2, 3, 4].map((x) => result.get(`${x},0`))).toEqual([4, 2, 2, 2, 6]);
    });

    it("grows outward from an existing edge into a three-tile-wide liquid path", () => {
        const existing = rectangularTerrain(-1, -1, 3, 3);
        const regions = createLiquidTerrainBrushRegions(
            "floor",
            { x: 1, y: 0 },
            { x: 1, y: 0 },
            { x: 2, y: 0 },
            tiles,
            existing,
        );
        const result = applyTerrainRegions(existing, regions);

        expect(Object.fromEntries(result)).toEqual({
            "-1,-1": tiles.topLeft,
            "0,-1": tiles.top,
            "1,-1": tiles.top,
            "2,-1": tiles.top,
            "3,-1": tiles.topRight,
            "-1,0": tiles.left,
            "0,0": tiles.center,
            "1,0": tiles.center,
            "2,0": tiles.center,
            "3,0": tiles.right,
            "-1,1": tiles.bottomLeft,
            "0,1": tiles.bottom,
            "1,1": tiles.bottom,
            "2,1": tiles.bottom,
            "3,1": tiles.bottomRight,
        });
    });

    it("moves the contour outward as a stroke reaches an existing edge", () => {
        const existing = rectangularTerrain(-1, -1, 3, 3);
        const regions = createLiquidTerrainBrushRegions(
            "floor",
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            tiles,
            existing,
        );
        const result = applyTerrainRegions(existing, regions);

        expect(result.get("0,0")).toBe(tiles.center);
        expect(result.get("1,0")).toBe(tiles.center);
        expect(result.get("2,0")).toBe(tiles.right);
        expect(result.get("1,-1")).toBe(tiles.top);
        expect(result.get("1,1")).toBe(tiles.bottom);
    });

    it("wraps a newly placed centre and closes it into a nearby matching field", () => {
        const existing = rectangularTerrain(1, -1, 3, 3);
        const regions = createLiquidTerrainBrushRegions(
            "floor",
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            tiles,
            existing,
        );
        const result = applyTerrainRegions(existing, regions);

        expect(result.get("0,0")).toBe(tiles.center);
        expect(result.get("1,0")).toBe(tiles.center);
        expect(result.get("2,0")).toBe(tiles.center);
        expect(result.get("-1,0")).toBe(tiles.left);
        expect(result.get("3,0")).toBe(tiles.right);
        expect([...result.values()]).not.toContain(0);
    });

    it("joins a new bubble when its generated outline touches an existing outline", () => {
        const existing = rectangularTerrain(2, -1, 3, 3);
        const regions = createLiquidTerrainBrushRegions(
            "floor",
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            tiles,
            existing,
        );
        const result = applyTerrainRegions(existing, regions);

        expect(result.get("0,0")).toBe(tiles.center);
        expect(result.get("1,0")).toBe(tiles.center);
        expect(result.get("2,0")).toBe(tiles.center);
        expect(result.get("3,0")).toBe(tiles.center);
        expect(result.get("-1,0")).toBe(tiles.left);
        expect(result.get("4,0")).toBe(tiles.right);
    });

    it("absorbs the complete destination field when a stroke reaches its near edge", () => {
        const existing = [...rectangularTerrain(-1, -1, 3, 3), ...rectangularTerrain(5, -1, 3, 3)];
        const regions = createLiquidTerrainBrushRegions(
            "floor",
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 5, y: 0 },
            tiles,
            existing,
        );
        const result = applyTerrainRegions(existing, regions);

        expect(result.get("6,0")).toBe(tiles.center);
        expect(result.get("7,0")).toBe(tiles.right);
        expect(result.get("6,-1")).toBe(tiles.top);
        expect(result.get("6,1")).toBe(tiles.bottom);
    });

    it("connects matching terrain stored under a different tileset GID range", () => {
        const aliasOffset = 100;
        const aliasGids = new Set(Object.values(tiles).map((gid) => gid + aliasOffset));
        const existing = rectangularTerrain(2, -1, 3, 3).map((tile) => ({ ...tile, gid: tile.gid + aliasOffset }));
        const regions = createLiquidTerrainBrushRegions(
            "floor",
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            tiles,
            existing,
            new Set([...Object.values(tiles), ...aliasGids]),
        );
        const result = applyTerrainRegions(existing, regions);

        expect(result.get("3,0")).toBe(tiles.center);
        expect(result.get("4,0")).toBe(tiles.right);
    });

    it("keeps a diagonally touching field separate under cardinal contour rules", () => {
        const existing = [
            { x: 2, y: 2, gid: tiles.topLeft },
            { x: 3, y: 2, gid: tiles.topRight },
            { x: 2, y: 3, gid: tiles.bottomLeft },
            { x: 3, y: 3, gid: tiles.bottomRight },
        ];
        const regions = createLiquidTerrainBrushRegions(
            "floor",
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            tiles,
            existing,
        );
        const patch = regionTiles(regions);
        const result = applyTerrainRegions(existing, regions);

        expect(patch.has("2,2")).toBe(false);
        expect(result.get("2,2")).toBe(tiles.topLeft);
        expect(result.get("1,1")).toBe(tiles.bottomRight);
    });

    it("can expand an already branched connected field", () => {
        const seed = rectangularTerrain(-1, -1, 3, 3);
        const horizontal = createLiquidTerrainBrushRegions(
            "floor",
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 4, y: 0 },
            tiles,
            seed,
        );
        const afterHorizontal = applyTerrainRegions(seed, horizontal);
        const vertical = createLiquidTerrainBrushRegions(
            "floor",
            { x: 0, y: 0 },
            { x: 0, y: 0 },
            { x: 0, y: 4 },
            tiles,
            terrainTiles(afterHorizontal),
        );
        const existing = terrainTiles(applyTerrainRegions(terrainTiles(afterHorizontal), vertical));
        const regions = createLiquidTerrainBrushRegions(
            "floor",
            { x: 4, y: 0 },
            { x: 4, y: 0 },
            { x: 6, y: 0 },
            tiles,
            existing,
        );
        const patch = regionTiles(regions);
        const result = applyTerrainRegions(existing, regions);

        expect(result.get("6,0")).toBe(tiles.center);
        expect(result.get("7,0")).toBe(tiles.right);
        expect(patch.has("0,5")).toBe(false);
        expect(result.get("0,5")).toBe(tiles.bottom);
    });

    it("keeps the swept core continuous across skipped cells and turns", () => {
        const initial = [
            { x: -1, y: -1, gid: tiles.topLeft },
            { x: 0, y: -1, gid: tiles.top },
            { x: 1, y: -1, gid: tiles.topRight },
            { x: -1, y: 0, gid: tiles.left },
            { x: 0, y: 0, gid: tiles.center },
            { x: 1, y: 0, gid: tiles.right },
            { x: -1, y: 1, gid: tiles.bottomLeft },
            { x: 0, y: 1, gid: tiles.bottom },
            { x: 1, y: 1, gid: tiles.bottomRight },
        ];
        const horizontal = createLiquidTerrainBrushRegions(
            "floor",
            { x: 1, y: 0 },
            { x: 1, y: 0 },
            { x: 3, y: 0 },
            tiles,
            initial,
        );
        const afterHorizontal = applyTerrainRegions(initial, horizontal);
        const turned = createLiquidTerrainBrushRegions(
            "floor",
            { x: 1, y: 0 },
            { x: 3, y: 0 },
            { x: 3, y: 2 },
            tiles,
            terrainTiles(afterHorizontal),
        );
        const result = applyTerrainRegions(terrainTiles(afterHorizontal), turned);

        for (const coordinate of ["0,0", "1,0", "2,0", "3,0", "3,1", "3,2"]) {
            expect(result.get(coordinate), coordinate).toBe(tiles.center);
        }
        expect(result.get("2,1")).toBe(tiles.innerBottomLeft);
        expect([...result.values()]).not.toContain(0);
    });

    it("re-expands a large persisted surface with a bounded local patch", () => {
        const existing = rectangularTerrain(0, 0, 80, 40);
        expect(
            createLiquidTerrainBrushRegions(
                "floor",
                { x: 40, y: 20 },
                { x: 40, y: 20 },
                { x: 40, y: 20 },
                tiles,
                existing,
            ),
        ).toEqual([]);
        const firstExpansion = createLiquidTerrainBrushRegions(
            "floor",
            { x: 78, y: 20 },
            { x: 78, y: 20 },
            { x: 80, y: 20 },
            tiles,
            existing,
        );

        expect(regionCellCount(firstExpansion)).toBeLessThan(50);
        expect(firstExpansion.length).toBeLessThan(10);
        expect(() =>
            TeapotTilePatch.parse({ mapId: "world", expectedRevision: 0, regions: firstExpansion }),
        ).not.toThrow();

        const afterFirstExpansion = applyTerrainRegions(existing, firstExpansion);
        expect(afterFirstExpansion.get("80,20")).toBe(tiles.center);
        expect(afterFirstExpansion.get("81,20")).toBe(tiles.right);

        const secondExpansion = createLiquidTerrainBrushRegions(
            "floor",
            { x: 80, y: 20 },
            { x: 80, y: 20 },
            { x: 82, y: 20 },
            tiles,
            terrainTiles(afterFirstExpansion),
        );
        const afterSecondExpansion = applyTerrainRegions(terrainTiles(afterFirstExpansion), secondExpansion);

        expect(regionCellCount(secondExpansion)).toBeLessThan(50);
        expect(afterSecondExpansion.get("82,20")).toBe(tiles.center);
        expect(afterSecondExpansion.get("83,20")).toBe(tiles.right);
        expect(afterSecondExpansion.get("0,0")).toBe(tiles.topLeft);
    });

    it("bridges two persisted surfaces into one continuous contour", () => {
        const existing = [...rectangularTerrain(0, 0, 3, 3), ...rectangularTerrain(6, 0, 3, 3)];
        const regions = createLiquidTerrainBrushRegions(
            "floor",
            { x: 2, y: 1 },
            { x: 2, y: 1 },
            { x: 6, y: 1 },
            tiles,
            existing,
        );
        const result = applyTerrainRegions(existing, regions);

        for (let x = 1; x <= 7; x += 1) expect(result.get(`${x},1`), `x=${x}`).toBe(tiles.center);
        expect(result.get("0,1")).toBe(tiles.left);
        expect(result.get("8,1")).toBe(tiles.right);
    });

    it("cuts a water opening and places borderless water beneath the covering contour", () => {
        const cover = rectangularTerrain(0, 0, 7, 7);
        const composition = createWaterTerrainBrushRegions(
            "floor",
            "water",
            { x: 3, y: 3 },
            { x: 3, y: 3 },
            50,
            cover,
            [],
            [{ tiles, gids: new Set(Object.values(tiles)) }],
        );
        const coverPatch = regionTilesForLayer(composition.regions, "floor");
        const waterPatch = regionTilesForLayer(composition.regions, "water");

        expect(coverPatch.get("3,3")).toBe(0);
        expect(coverPatch.get("3,2")).toBe(tiles.bottom);
        expect(coverPatch.get("2,2")).toBe(tiles.innerBottomRight);
        expect(waterPatch.size).toBe(9);
        expect(new Set(waterPatch.values())).toEqual(new Set([50]));
        expect(composition.visibleWater).toEqual([{ x: 3, y: 3 }]);
    });

    it("keeps borderless water to the painted footprint when there is no covering surface", () => {
        const composition = createWaterTerrainRectangleRegions(
            "floor",
            "water",
            { x: 1, y: 2 },
            { x: 3, y: 3 },
            50,
            [],
            [],
            [{ tiles, gids: new Set(Object.values(tiles)) }],
        );

        expect(regionTilesForLayer(composition.regions, "floor")).toEqual(new Map());
        expect(regionTilesForLayer(composition.regions, "water").size).toBe(6);
        expect(composition.visibleWater).toHaveLength(6);
    });

    it("extends an existing water opening without restoring a baked water border", () => {
        const cover = rectangularTerrain(0, 0, 8, 7);
        const first = createWaterTerrainBrushRegions(
            "floor",
            "water",
            { x: 3, y: 3 },
            { x: 3, y: 3 },
            50,
            cover,
            [],
            [{ tiles, gids: new Set(Object.values(tiles)) }],
        );
        const afterCover = applyTerrainRegions(
            cover,
            first.regions.filter((region) => region.layer === "floor"),
        );
        const afterWater = regionTilesForLayer(first.regions, "water");
        const second = createWaterTerrainBrushRegions(
            "floor",
            "water",
            { x: 4, y: 3 },
            { x: 6, y: 3 },
            50,
            terrainTiles(afterCover),
            terrainTiles(afterWater),
            [{ tiles, gids: new Set(Object.values(tiles)) }],
        );
        const finalCover = applyTerrainRegions(
            terrainTiles(afterCover),
            second.regions.filter((region) => region.layer === "floor"),
        );

        expect(finalCover.get("6,3")).toBe(0);
        expect(finalCover.get("7,3")).toBe(tiles.right);
        expect(new Set(regionTilesForLayer(second.regions, "water").values())).toEqual(new Set([50]));
    });
});
