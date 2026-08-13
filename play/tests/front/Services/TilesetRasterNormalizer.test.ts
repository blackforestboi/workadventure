import { describe, expect, it } from "vitest";

import floorEditorToolSource from "../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts?raw";
import rasterNormalizerSource from "../../../src/front/Services/AssetGeneration/TilesetRasterNormalizer.ts?raw";
import { terrainTileCrop } from "../../../src/front/Services/AssetGeneration/TilesetRasterNormalizer";
import { removeEdgeConnectedBackground } from "../../../src/front/Services/AssetGeneration/EdgeConnectedBackground";

describe("terrainTileCrop", () => {
    it("centers a square crop so every source becomes one terrain tile", () => {
        expect(terrainTileCrop(65, 33)).toEqual({ sourceX: 16, sourceY: 0, sourceSize: 33 });
        expect(terrainTileCrop(128, 256)).toEqual({ sourceX: 0, sourceY: 64, sourceSize: 128 });
        expect(terrainTileCrop(32, 32)).toEqual({ sourceX: 0, sourceY: 0, sourceSize: 32 });
    });

    it("rejects invalid or excessive raster dimensions", () => {
        expect(() => terrainTileCrop(0, 32)).toThrow("invalid dimensions");
        expect(() => terrainTileCrop(2049, 32)).toThrow("cannot exceed");
    });
});

describe("generated terrain tile transparency", () => {
    it("removes the navy guide background around a bounded terrain patch", () => {
        const width = 32;
        const height = 32;
        const pixels = new Uint8ClampedArray(width * height * 4);
        for (let index = 0; index < width * height; index += 1) pixels.set([32, 41, 65, 255], index * 4);
        for (let y = 4; y < 28; y += 1) {
            for (let x = 4; x < 28; x += 1) pixels.set([35, 40, 42, 255], (y * width + x) * 4);
        }

        const cleaned = removeEdgeConnectedBackground(pixels, width, height);

        expect(cleaned[3]).toBe(0);
        expect(cleaned[(16 * width + 16) * 4 + 3]).toBe(255);
    });

    it("cleans new uploads without mutating loaded game textures", () => {
        expect(rasterNormalizerSource).toContain("cleanTilesetCanvas(context, TILE_SIZE, TILE_SIZE)");
        expect(floorEditorToolSource).not.toContain("cleanLoadedTilesetSpriteSheet");
    });
});
