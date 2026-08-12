import { describe, expect, it } from "vitest";

import {
    TERRAIN_SURFACE_CATEGORIES,
    TERRAIN_SURFACE_SPRITE_ROLES,
    TERRAIN_SURFACES,
    getTerrainSurface,
    getTerrainSurfaceSpriteRequirements,
    searchTerrainSurfaces,
    validateTerrainSurfaceCatalog,
} from "../../../../../src/front/Services/BuiltInTerrainCatalog";

describe("terrain surface catalog", () => {
    it("outlines all 203 surface types independently of current art availability", () => {
        expect(TERRAIN_SURFACES).toHaveLength(203);
        expect(new Set(TERRAIN_SURFACES.map((surface) => surface.id))).toHaveLength(203);
        expect(new Set(TERRAIN_SURFACES.map((surface) => surface.category))).toEqual(
            new Set(TERRAIN_SURFACE_CATEGORIES),
        );
        expect(
            TERRAIN_SURFACES.every((surface) =>
                surface.category === "water-wetland"
                    ? surface.assets.roles.length === 1
                    : surface.assets.roles.length === 21,
            ),
        ).toBe(true);
        expect(
            TERRAIN_SURFACES.filter((surface) => surface.id !== "pond").every((surface) => !surface.editorEligible),
        ).toBe(true);
        expect(TERRAIN_SURFACES.some((surface) => /(^|-)(tree|boulder|bench|crate)(-|$)/.test(surface.id))).toBe(false);
    });

    it("defines a repeatable patch and enclosure template with small and large curves", () => {
        expect(TERRAIN_SURFACE_SPRITE_ROLES).toEqual(
            expect.arrayContaining([
                "center",
                "edgeNorth",
                "externalCornerSmallNorthWest",
                "externalCornerLargeNorthWest",
                "internalCornerSmallNorthWest",
                "internalCornerLargeNorthWest",
            ]),
        );
        const requirements = getTerrainSurfaceSpriteRequirements("short-turf");
        expect(requirements?.map((asset) => asset.role)).toEqual(TERRAIN_SURFACE_SPRITE_ROLES);
    });

    it("marks verified legacy art as partial and every missing role explicitly not-started", () => {
        for (const id of ["packed-earth", "loam", "short-turf"]) {
            const surface = getTerrainSurface(id);
            expect(surface?.assets.readiness).toBe("partial");
            expect(surface?.assets.hasAnyAvailableAssets).toBe(true);
            expect(surface?.assets.roles.filter((role) => role.availability === "available")).toHaveLength(13);
            expect(surface?.assets.roles.filter((role) => role.availability === "not-started")).toHaveLength(8);
        }
        expect(getTerrainSurface("dune-sand")?.assets).toMatchObject({
            readiness: "not-started",
            hasAnyAvailableAssets: false,
        });
        expect(getTerrainSurface("dune-sand")?.assets.roles.every((role) => role.availability === "not-started")).toBe(
            true,
        );
    });

    it("stores movement speed and semantic surface effects without height metadata", () => {
        expect(getTerrainSurface("packed-earth")?.traversal).toMatchObject({ mode: "walk", speedMultiplier: 1 });
        expect(getTerrainSurface("sheet-ice")?.traversal.effects).toContainEqual({
            type: "slippery",
            intensity: 0.8,
        });
        expect(getTerrainSurface("deep-stream")?.traversal).toMatchObject({ mode: "swim", speedMultiplier: 0.6 });
        expect(getTerrainSurface("void-chasm")?.traversal).toMatchObject({
            mode: "blocked",
            speedMultiplier: null,
        });
        expect(TERRAIN_SURFACES.every((surface) => !("height" in surface))).toBe(true);
    });

    it("marks each surface as independently mixable or non-mixable", () => {
        expect(validateTerrainSurfaceCatalog()).toEqual([]);
        expect(getTerrainSurface("fine-sand")?.mixable).toBe(true);
        expect(getTerrainSurface("packed-earth")?.mixable).toBe(true);
        expect(getTerrainSurface("pond")?.mixable).toBe(false);
        expect(getTerrainSurface("molten-lava")?.mixable).toBe(false);
        expect(getTerrainSurface("cobblestone-street")?.mixable).toBe(false);
        expect(TERRAIN_SURFACES.every((surface) => typeof surface.mixable === "boolean")).toBe(true);
    });

    it("models water by fill appearance while leaving its edge to the environment", () => {
        expect(getTerrainSurface("pond")?.waterAppearance).toEqual({
            kind: "still",
            color: "blue",
            waveform: "small-ripples",
            boundaryOwner: "environment",
        });
        expect(getTerrainSurface("rapids")?.waterAppearance).toMatchObject({
            kind: "whitewater",
            waveform: "foam",
            boundaryOwner: "environment",
        });
        expect(getTerrainSurface("open-sea")?.waterAppearance).toMatchObject({
            kind: "coastal",
            color: "deep-blue",
            waveform: "breaking-waves",
        });
        expect(getTerrainSurface("pond")?.assets).toMatchObject({
            templateProfileId: "water-fill-32-v1",
            readiness: "complete",
        });
        expect(getTerrainSurface("pond")?.assets.roles).toHaveLength(1);
        expect(
            TERRAIN_SURFACES.filter((surface) => surface.category === "water-wetland").every(
                (surface) => surface.waterAppearance?.boundaryOwner === "environment",
            ),
        ).toBe(true);
    });

    it("supports surface-level search and readiness, traversal, and effect filters", () => {
        expect(searchTerrainSurfaces({ query: "alien sand" }).map((surface) => surface.id)).toContain(
            "iridescent-alien-sand",
        );
        expect(
            searchTerrainSurfaces({ readiness: "partial" })
                .map((surface) => surface.id)
                .sort(),
        ).toEqual(["loam", "packed-earth", "short-turf"]);
        expect(searchTerrainSurfaces({ effect: "slippery" })).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: "sheet-ice" })]),
        );
        expect(
            searchTerrainSurfaces({ traversal: "blocked" }).every(
                (surface) => surface.traversal.speedMultiplier === null,
            ),
        ).toBe(true);
    });
});
