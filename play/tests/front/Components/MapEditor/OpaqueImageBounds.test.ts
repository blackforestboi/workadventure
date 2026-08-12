import { describe, expect, it } from "vitest";

import {
    getDefaultHeightInTiles,
    getOpaqueImageBounds,
} from "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/OpaqueImageBounds";

describe("opaque image bounds", () => {
    it("measures only non-transparent image content", () => {
        const pixels = new Uint8ClampedArray(4 * 4 * 4);
        pixels[(1 * 4 + 1) * 4 + 3] = 255;
        pixels[(2 * 4 + 2) * 4 + 3] = 255;

        expect(getOpaqueImageBounds(pixels, 4, 4)).toEqual({ width: 2, height: 2 });
    });

    it("starts one tile wide and derives a tall footprint from the opaque aspect ratio", () => {
        expect(getDefaultHeightInTiles(40, 120)).toBe(3);
    });
});
