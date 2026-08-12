import { describe, expect, it } from "vitest";

import assetGenerationPanelSource from "../../../../src/front/Components/AssetGeneration/AssetGenerationPanel.svelte?raw";
import {
    getGridFittedRasterLayout,
    getOpaqueRasterBounds,
} from "../../../../src/front/Services/AssetGeneration/RasterOutputNormalizer";

describe("generated map-object raster normalization", () => {
    it("finds the smallest rectangle containing every non-transparent pixel", () => {
        const pixels = new Uint8ClampedArray(6 * 5 * 4);
        pixels[(1 * 6 + 2) * 4 + 3] = 255;
        pixels[(3 * 6 + 4) * 4 + 3] = 1;

        expect(getOpaqueRasterBounds(pixels, 6, 5)).toEqual({
            left: 2,
            top: 1,
            width: 3,
            height: 3,
        });
    });

    it.each([
        [
            { left: 0, top: 0, width: 40, height: 120 },
            { columns: 1, rows: 2, width: 32, height: 64 },
        ],
        [
            { left: 0, top: 0, width: 120, height: 40 },
            { columns: 2, rows: 1, width: 64, height: 32 },
        ],
        [
            { left: 0, top: 0, width: 100, height: 80 },
            { columns: 2, rows: 2, width: 64, height: 64 },
        ],
    ])("fits trimmed content into the expected square-cell canvas", (bounds, expected) => {
        const layout = getGridFittedRasterLayout(bounds);

        expect(layout).toMatchObject({
            columns: expected.columns,
            rows: expected.rows,
            canvasWidth: expected.width,
            canvasHeight: expected.height,
        });
        expect(layout.destinationX).toBeGreaterThanOrEqual(0);
        expect(layout.destinationY).toBeGreaterThanOrEqual(0);
        expect(layout.destinationX + layout.destinationWidth).toBeLessThanOrEqual(layout.canvasWidth);
        expect(layout.destinationY + layout.destinationHeight).toBeLessThanOrEqual(layout.canvasHeight);
    });

    it("only alpha-trims and grid-fits static generated map objects", () => {
        expect(assetGenerationPanelSource).toContain(
            'fitMapObjectToGrid: target === "environment-object" && generation.animation === undefined',
        );
    });
});
