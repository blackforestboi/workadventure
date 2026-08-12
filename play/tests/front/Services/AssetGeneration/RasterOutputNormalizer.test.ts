import { describe, expect, it } from "vitest";

import assetGenerationPanelSource from "../../../../src/front/Components/AssetGeneration/AssetGenerationPanel.svelte?raw";

describe("generated map-object raster normalization", () => {
    it("preserves the provider's detailed map-object raster instead of fitting it into a 32px tile grid", () => {
        expect(assetGenerationPanelSource).not.toContain("fitMapObjectToGrid");
        expect(assetGenerationPanelSource).toContain("removeOpaqueEdgeBackground: true");
        expect(assetGenerationPanelSource).toContain(
            'outputSize?.pixelated === true ? "[image-rendering:pixelated]" : ""',
        );
        expect(assetGenerationPanelSource).toContain("electric-magenta #FF00FF background");
    });
});
