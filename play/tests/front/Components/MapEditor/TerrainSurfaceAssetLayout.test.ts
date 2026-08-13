import { describe, expect, it } from "vitest";

import surfaceEditorSource from "../../../../src/front/Components/MapEditor/FloorEditor/TerrainSurfaceAssetEditor.svelte?raw";
import floorEditorSource from "../../../../src/front/Components/MapEditor/FloorEditor/FloorEditor.svelte?raw";
import {
    clampTerrainSurfaceCrop,
    createInitialTerrainSurfaceCrop,
    measureOpaquePixelBounds,
    TERRAIN_SURFACE_GRID_SIZE,
    TERRAIN_SURFACE_VARIATION_CELLS,
    terrainSurfaceTilePixelSize,
} from "../../../../src/front/Components/MapEditor/FloorEditor/TerrainSurfaceAssetLayout";
import { removeEdgeConnectedBackground } from "../../../../src/front/Services/AssetGeneration/EdgeConnectedBackground";

describe("terrain surface asset layout", () => {
    it("measures alpha content and proposes a centered native-resolution 5×5 crop", () => {
        const pixels = new Uint8ClampedArray(100 * 80 * 4);
        for (let row = 20; row < 60; row += 1) {
            for (let column = 30; column < 70; column += 1) pixels[(row * 100 + column) * 4 + 3] = 255;
        }

        const bounds = measureOpaquePixelBounds(pixels, 100, 80);
        expect(bounds).toEqual({ left: 30, top: 20, right: 69, bottom: 59 });
        const crop = createInitialTerrainSurfaceCrop(100, 80, bounds);
        expect(crop.size % TERRAIN_SURFACE_GRID_SIZE).toBe(0);
        expect(crop).toEqual({ x: 28, y: 18, size: 45 });
        expect(terrainSurfaceTilePixelSize(crop)).toBe(9);
    });

    it("keeps manual crop movement and sizing inside the source without choosing a rendering resolution", () => {
        expect(clampTerrainSurfaceCrop({ x: -20, y: 900, size: 503 }, 900, 700)).toEqual({
            x: 0,
            y: 195,
            size: 505,
        });
        expect(TERRAIN_SURFACE_VARIATION_CELLS).toHaveLength(5);
    });

    it("makes a solid edge-connected surface background transparent", () => {
        const width = 5;
        const height = 5;
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let index = 0; index < width * height; index += 1) {
            pixels.set([23, 36, 58, 255], index * 4);
        }
        for (let row = 1; row < 4; row += 1) {
            for (let column = 1; column < 4; column += 1) {
                pixels.set([181, 117, 62, 255], (row * width + column) * 4);
            }
        }

        const transparent = removeEdgeConnectedBackground(pixels, width, height);

        expect(transparent[3]).toBe(0);
        expect(transparent[(2 * width + 2) * 4 + 3]).toBe(255);
    });

    it("preserves matching colours enclosed inside the surface", () => {
        const width = 5;
        const height = 5;
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let index = 0; index < width * height; index += 1) pixels.set([23, 36, 58, 255], index * 4);
        for (let row = 1; row < 4; row += 1) {
            for (let column = 1; column < 4; column += 1) pixels.set([181, 117, 62, 255], (row * width + column) * 4);
        }
        pixels.set([23, 36, 58, 255], (2 * width + 2) * 4);

        const transparent = removeEdgeConnectedBackground(pixels, width, height);

        expect(transparent[(2 * width + 2) * 4 + 3]).toBe(255);
    });

    it("does not erase a uniformly opaque seamless surface", () => {
        const pixels = new Uint8ClampedArray(5 * 5 * 4);
        for (let index = 0; index < 25; index += 1) pixels.set([181, 117, 62, 255], index * 4);

        const unchanged = removeEdgeConnectedBackground(pixels, 5, 5);

        expect(unchanged.every((value, index) => value === pixels[index])).toBe(true);
    });

    it("reuses the existing generation flow and makes human review authoritative", () => {
        expect(floorEditorSource).toContain("Create surface");
        expect(floorEditorSource).toContain("<TerrainSurfaceAssetEditor");
        expect(surfaceEditorSource).toContain("<AssetGenerationPanel");
        expect(surfaceEditorSource).toContain('target="terrain-surface"');
        expect(surfaceEditorSource).toContain("External boundary");
        expect(surfaceEditorSource).toContain("Internal boundary");
        expect(surfaceEditorSource).toContain("Surface variations");
        expect(surfaceEditorSource).toContain("Approve surface asset");
        expect(surfaceEditorSource).toContain("cropTerrainSurfaceSource(sourceBlob, crop)");
        expect(surfaceEditorSource).toContain("sourceBlob = prepared.blob");
        expect(surfaceEditorSource).not.toContain("outputSize=");
        expect(surfaceEditorSource).not.toContain("32×32");
        expect(surfaceEditorSource).not.toContain("image-rendering:pixelated");
        expect(surfaceEditorSource).toContain("does not impose a pixel-art or fixed-resolution format");
    });
});
