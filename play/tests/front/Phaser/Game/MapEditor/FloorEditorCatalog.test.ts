import { surfaceOverlayLayerName, waterUnderlayLayerName } from "@workadventure/map-editor";
import type { ITiledMap, ITiledMapLayer, ITiledMapTileLayer } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    chooseDefaultPaintLayer,
    collectTerrainGids,
    findMatchingSurfaceLayer,
    findTopmostErasableLayer,
    findTopmostSurfaceLayer,
    getTerrainTilesetGids,
    resolveVegetationSelectionLayer,
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

function map(layers: readonly ITiledMapLayer[]): ITiledMap {
    return {
        layers,
        tilesets: [{ firstgid: 1 }, { firstgid: 101 }, { firstgid: 201 }, { firstgid: 301 }],
    } as unknown as ITiledMap;
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

    it("lets vegetation rectangle selection target a surface without an active paint brush", () => {
        const layers = [tileLayer("collisions", [99]), tileLayer("floor", [7])];

        expect(resolveVegetationSelectionLayer("", layers)).toBe("floor");
        expect(resolveVegetationSelectionLayer("walls", layers)).toBe("floor");
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

    it("targets the topmost visible surface overlay when placing water", () => {
        const floor = tileLayer("floor", [11, 12, 13]);
        const lowerSurface = tileLayer(surfaceOverlayLayerName("floor", 101, "lower"), [101, 0, 0]);
        const upperSurface = tileLayer(surfaceOverlayLayerName("floor", 201, "upper"), [201, 202, 0]);
        const unrelatedWall = tileLayer("walls", [301, 302]);

        expect(findTopmostSurfaceLayer([floor, lowerSurface, upperSurface, unrelatedWall], "floor", 0, 0)).toBe(
            upperSurface.name,
        );
        expect(findTopmostSurfaceLayer([floor, lowerSurface, { ...upperSurface, visible: false }], "floor", 0, 0)).toBe(
            lowerSurface.name,
        );
        expect(findTopmostSurfaceLayer([floor, lowerSurface, upperSurface], "floor", 1, 0)).toBe(upperSurface.name);
        expect(findTopmostSurfaceLayer([floor, lowerSurface, upperSurface], "floor", 2, 0)).toBe("floor");

        upperSurface.data = [0, 202, 0];
        const upperWater = tileLayer(waterUnderlayLayerName(upperSurface.name), [901, 0, 0]);
        expect(findTopmostSurfaceLayer([floor, lowerSurface, upperWater, upperSurface], "floor", 0, 0)).toBe(
            upperSurface.name,
        );
    });

    describe("matching an existing surface field", () => {
        it("returns a matching occupied overlay", () => {
            const floor = tileLayer("floor", [11]);
            const matchingSurface = tileLayer(surfaceOverlayLayerName("floor", 101, "matching"), [105]);

            expect(findMatchingSurfaceLayer(map([floor, matchingSurface]), "floor", 101, 0, 0)).toBe(
                matchingSurface.name,
            );
        });

        it("returns the matching occupied base layer when no overlay covers the cell", () => {
            const floor = tileLayer("floor", [105]);
            const emptySurface = tileLayer(surfaceOverlayLayerName("floor", 101, "empty"), [0]);

            expect(findMatchingSurfaceLayer(map([floor, emptySurface]), "floor", 101, 0, 0)).toBe("floor");
        });

        it("does not reuse a buried match below an occupied surface from another tileset", () => {
            const floor = tileLayer("floor", [105]);
            const differentSurface = tileLayer(surfaceOverlayLayerName("floor", 201, "different"), [201]);

            expect(findMatchingSurfaceLayer(map([floor, differentSurface]), "floor", 101, 0, 0)).toBeUndefined();
        });

        it("returns no match when the related surfaces are empty at the starting cell", () => {
            const floor = tileLayer("floor", [0]);
            const emptySurface = tileLayer(surfaceOverlayLayerName("floor", 101, "empty"), [0]);

            expect(findMatchingSurfaceLayer(map([floor, emptySurface]), "floor", 101, 0, 0)).toBeUndefined();
        });

        it("ignores a hidden matching overlay", () => {
            const floor = tileLayer("floor", [205]);
            const matchingSurface = tileLayer(surfaceOverlayLayerName("floor", 101, "hidden"), [105]);

            expect(
                findMatchingSurfaceLayer(map([floor, { ...matchingSurface, visible: false }]), "floor", 201, 0, 0),
            ).toBe("floor");
        });
    });
});
