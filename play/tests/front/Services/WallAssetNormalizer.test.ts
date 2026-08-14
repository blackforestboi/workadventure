import { describe, expect, it } from "vitest";

import {
    WALL_ASSET_HEIGHT,
    WALL_ASSET_WIDTH,
    wallAssetCrop,
    wallAssetFileName,
} from "../../../src/front/Services/AssetGeneration/WallAssetNormalizer";

describe("wall asset normalization", () => {
    it("uses a two-tile-wide, two-tile-high output", () => {
        expect({ width: WALL_ASSET_WIDTH, height: WALL_ASSET_HEIGHT }).toEqual({ width: 64, height: 64 });
    });

    it("center-crops wide and tall images to the wall aspect ratio", () => {
        expect(wallAssetCrop(512, 512)).toEqual({
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 512,
            sourceHeight: 512,
        });
        expect(wallAssetCrop(128, 512)).toEqual({
            sourceX: 0,
            sourceY: 192,
            sourceWidth: 128,
            sourceHeight: 128,
        });
        expect(wallAssetCrop(64, 64)).toEqual({
            sourceX: 0,
            sourceY: 0,
            sourceWidth: 64,
            sourceHeight: 64,
        });
    });

    it("rejects invalid or oversized images", () => {
        expect(() => wallAssetCrop(0, 64)).toThrow("invalid dimensions");
        expect(() => wallAssetCrop(4097, 64)).toThrow("cannot exceed");
    });

    it("renames normalized files as PNGs", () => {
        expect(wallAssetFileName("brick-wall.jpg")).toBe("brick-wall.png");
        expect(wallAssetFileName("generated wall")).toBe("generated wall.png");
    });
});
