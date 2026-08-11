import { describe, expect, it } from "vitest";

import { terrainTileCrop } from "../../../src/front/Services/AssetGeneration/TilesetRasterNormalizer";

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
