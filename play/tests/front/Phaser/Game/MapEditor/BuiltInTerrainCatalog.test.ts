import { describe, expect, it } from "vitest";

import {
    BUILT_IN_ATLAS_ASSETS,
    BUILT_IN_TERRAIN_ASSETS,
    BUILT_IN_TERRAIN_TILESET,
    getBuiltInTerrainTileIds,
    getBuiltInWaterFillTileId,
    searchBuiltInAtlasAssets,
    searchBuiltInTerrainAssets,
} from "../../../../../src/front/Services/BuiltInTerrainCatalog";

describe("built-in terrain catalog", () => {
    it("exposes a curated, terrain-only metadata record for hundreds of LPC background cells", () => {
        const tileIds = getBuiltInTerrainTileIds();

        expect(BUILT_IN_TERRAIN_TILESET.columns).toBe(32);
        expect(BUILT_IN_TERRAIN_TILESET.tileCount).toBe(1024);
        expect(BUILT_IN_TERRAIN_TILESET.groups.map((group) => group.name)).toContain("Snow and ice");
        expect(BUILT_IN_TERRAIN_TILESET.groups.map((group) => group.name)).toContain("Stone path");
        expect(tileIds.length).toBeGreaterThan(200);
        expect(new Set(tileIds)).toHaveLength(tileIds.length);
        expect(tileIds.every((tileId) => tileId >= 0 && tileId < BUILT_IN_TERRAIN_TILESET.tileCount)).toBe(true);
        expect(BUILT_IN_TERRAIN_ASSETS).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    terrainType: "water",
                    solid: true,
                    animated: false,
                    description: expect.stringContaining("rivers"),
                }),
                expect.objectContaining({
                    terrainType: "path",
                    solid: false,
                    tags: expect.arrayContaining(["paving"]),
                }),
            ]),
        );
    });

    it("keeps Wang-backed terrain palettes coherent and exposes their exact nine-slice roles", () => {
        const expected = {
            "light-dirt": [64, 65, 66, 96, 97, 98, 128, 129, 130, 34, 33, 2, 1],
            "dark-dirt": [73, 74, 75, 105, 106, 107, 137, 138, 139, 43, 42, 11, 10],
            "meadow-grass": [256, 257, 258, 288, 289, 290, 320, 321, 322, 226, 225, 194, 193],
            water: [655, 656, 657, 687, 688, 689, 719, 720, 721, 625, 624, 593, 592],
        } as const;

        expect(new Set(BUILT_IN_TERRAIN_TILESET.groups.map((group) => group.id))).toHaveLength(
            BUILT_IN_TERRAIN_TILESET.groups.length,
        );
        for (const [id, matrix] of Object.entries(expected)) {
            const group = BUILT_IN_TERRAIN_TILESET.groups.find((candidate) => candidate.id === id);
            expect(group).toBeDefined();
            expect(group?.autotile).toBeDefined();
            expect(Object.values(group!.autotile!)).toEqual(matrix);
            if (id !== "water") expect(group?.displayTileIds.slice(0, 9)).toEqual(matrix.slice(0, 9));
            expect(group?.tileIds).toContain(group?.previewTileId);
            expect(Object.values(group!.autotile!).every((tileId) => group!.tileIds.includes(tileId))).toBe(true);
        }
        expect(BUILT_IN_TERRAIN_TILESET.groups.find((group) => group.id === "water")?.displayTileIds).toEqual([688]);
        expect(getBuiltInWaterFillTileId(688)).toBe(688);
        expect(getBuiltInWaterFillTileId(655)).toBe(688);
        expect(getBuiltInWaterFillTileId(97)).toBeUndefined();
    });

    it("searches the descriptions, tags, terrain type, and solid option used by map generation", () => {
        expect(
            searchBuiltInTerrainAssets({ query: "arctic glacier" }).every((asset) => asset.terrainType === "snow"),
        ).toBe(true);
        expect(searchBuiltInTerrainAssets({ terrainType: "water", solid: true }).length).toBeGreaterThan(0);
        expect(searchBuiltInTerrainAssets({ query: "furniture" })).toHaveLength(0);
    });

    it("classifies every non-empty atlas cell without leaking object fragments into the terrain palette", () => {
        expect(BUILT_IN_ATLAS_ASSETS).toHaveLength(960);
        expect(new Set(BUILT_IN_ATLAS_ASSETS.map((asset) => asset.tileId))).toHaveLength(960);
        expect(BUILT_IN_ATLAS_ASSETS.every((asset) => asset.description.length > 80 && asset.tags.length > 4)).toBe(
            true,
        );
        expect(
            BUILT_IN_ATLAS_ASSETS.filter((asset) => asset.kind === "terrain")
                .map((asset) => asset.tileId)
                .sort((left, right) => left - right),
        ).toEqual(BUILT_IN_TERRAIN_ASSETS.map((asset) => asset.tileId).sort((left, right) => left - right));
        expect(searchBuiltInAtlasAssets({ query: "wooden bridge", kind: "structure" })).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    placement: "multi-tile-fragment",
                    editorEligible: false,
                    solid: true,
                }),
            ]),
        );
        expect(searchBuiltInAtlasAssets({ query: "vegetable garden", kind: "vegetation" }).length).toBeGreaterThan(0);
    });

    it("recognizes both relative and absolute URLs for the bundled atlas", () => {
        expect(BUILT_IN_TERRAIN_TILESET.matchesImage("/resources/tilesets/lpc-outdoor-terrain.png")).toBe(true);
        expect(
            BUILT_IN_TERRAIN_TILESET.matchesImage(
                "http://play.workadventure.localhost/resources/tilesets/lpc-outdoor-terrain.png",
            ),
        ).toBe(true);
        expect(BUILT_IN_TERRAIN_TILESET.matchesImage("/resources/tilesets/floor_tiles.png")).toBe(false);
    });
});
