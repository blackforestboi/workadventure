import { describe, expect, it } from "vitest";

import { triangulateAlphaPixels } from "../../../../src/front/Services/AssetGeneration/TriangulationMatting";

describe("triangulateAlphaPixels", () => {
    it("recovers opaque foreground, soft edges, and transparent background", () => {
        const white = imageWithPixels([
            [255, 255, 255, 255],
            [100, 50, 25, 255],
            [177.5, 152.5, 140, 255],
        ]);
        const black = imageWithPixels([
            [0, 0, 0, 255],
            [100, 50, 25, 255],
            [50, 25, 12.5, 255],
        ]);

        const output = triangulateAlphaPixels(white, black);
        expect(pixel(output, 0)).toEqual([0, 0, 0, 0]);
        expect(pixel(output, 1)).toEqual([100, 50, 25, 255]);
        const softEdge = pixel(output, 2);
        expect(softEdge[0]).toBeCloseTo(100, 0);
        expect(softEdge[1]).toBeCloseTo(50, 0);
        expect(softEdge[2]).toBeGreaterThanOrEqual(24);
        expect(softEdge[2]).toBeLessThanOrEqual(25);
        expect(softEdge[3]).toBeGreaterThanOrEqual(127);
        expect(softEdge[3]).toBeLessThanOrEqual(128);
    });
});

function imageWithPixels(values: number[][]): ImageData {
    const data = new Uint8ClampedArray(values.flat());
    return { data, width: values.length, height: 1, colorSpace: "srgb" };
}

function pixel(image: ImageData, index: number): number[] {
    return [...image.data.slice(index * 4, index * 4 + 4)];
}
