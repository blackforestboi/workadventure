import { describe, expect, it } from "vitest";

import {
    getContainedCollisionFrame,
    getDefaultGridSizeInTiles,
    getOpaqueImageBounds,
} from "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/OpaqueImageBounds";

describe("opaque image bounds", () => {
    it("measures only non-transparent image content", () => {
        const pixels = new Uint8ClampedArray(4 * 4 * 4);
        pixels[(1 * 4 + 1) * 4 + 3] = 255;
        pixels[(2 * 4 + 2) * 4 + 3] = 255;

        expect(getOpaqueImageBounds(pixels, 4, 4)).toEqual({ left: 1, top: 1, width: 2, height: 2 });
    });

    it("scales square cells to contain the visible subject instead of the transparent source canvas", () => {
        expect(getContainedCollisionFrame({ left: 100, top: 40, width: 80, height: 120 }, 0.5, 0.5, 2, 2)).toEqual({
            width: 60,
            height: 60,
            offsetX: 40,
            offsetY: 20,
        });
    });

    it("keeps tall and wide grid cells square while containing the visible subject", () => {
        expect(getContainedCollisionFrame({ left: 0, top: 0, width: 40, height: 120 }, 1, 1, 2, 1)).toEqual({
            width: 60,
            height: 120,
            offsetX: -10,
            offsetY: 0,
        });
        expect(getContainedCollisionFrame({ left: 0, top: 0, width: 120, height: 40 }, 1, 1, 1, 2)).toEqual({
            width: 120,
            height: 60,
            offsetX: 0,
            offsetY: -10,
        });
    });

    it.each([
        [40, 120, { width: 1, height: 2 }],
        [120, 40, { width: 2, height: 1 }],
        [100, 100, { width: 2, height: 2 }],
        [100, 80, { width: 2, height: 2 }],
    ])("derives a square-cell %o×%o footprint that contains %o", (width, height, expected) => {
        expect(getDefaultGridSizeInTiles(width, height)).toEqual(expected);
    });
});
