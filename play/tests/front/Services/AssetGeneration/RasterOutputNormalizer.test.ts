import { describe, expect, it } from "vitest";

import assetGenerationPanelSource from "../../../../src/front/Components/AssetGeneration/AssetGenerationPanel.svelte?raw";
import { fitRasterWithinBounds } from "../../../../src/front/Services/AssetGeneration/RasterOutputNormalizer";

describe("generated map-object raster normalization", () => {
    it("preserves the provider's detailed map-object raster instead of fitting it into a 32px tile grid", () => {
        expect(assetGenerationPanelSource).not.toContain("fitMapObjectToGrid");
        expect(assetGenerationPanelSource).toContain("removeOpaqueEdgeBackground: true");
        expect(assetGenerationPanelSource).toContain(
            'outputSize?.pixelated === true ? "[image-rendering:pixelated]" : ""',
        );
        expect(assetGenerationPanelSource).toContain("electric-magenta #FF00FF background");
    });

    it("fits uploaded rasters inside a square canvas without changing their aspect ratio", () => {
        expect(fitRasterWithinBounds(400, 200, 320, 320)).toEqual({
            x: 0,
            y: 80,
            width: 320,
            height: 160,
        });
        expect(fitRasterWithinBounds(200, 400, 320, 320)).toEqual({
            x: 80,
            y: 0,
            width: 160,
            height: 320,
        });
    });
});
