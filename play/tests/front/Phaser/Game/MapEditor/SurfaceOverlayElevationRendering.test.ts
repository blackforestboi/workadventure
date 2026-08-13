import { describe, expect, it } from "vitest";

import gameMapFrontWrapperSource from "../../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper.ts?raw";
import floorEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts?raw";

describe("surface overlay elevation rendering", () => {
    it("positions the placement preview with the same sampled height field as the terrain mesh", () => {
        const hoverPreviewSource = floorEditorToolSource.match(
            /private showHoverPreview\([\s\S]*?\n {4}private clearHoverPreview/,
        )?.[0];

        expect(hoverPreviewSource).toBeDefined();
        expect(hoverPreviewSource).toContain("createElevationSampler(visibleMap)(tile.x + 0.5, tile.y + 0.5)");
        expect(hoverPreviewSource).toContain("const top = baseTop - elevationOffset - previewOffset");
    });

    it("restores saved overlays in their covered floor render band after reload", () => {
        expect(gameMapFrontWrapperSource).toContain("private getTileLayerRenderBands()");
        expect(gameMapFrontWrapperSource).toContain("surfaceOverlayCoverLayerName(layer.name)");
        expect(gameMapFrontWrapperSource).toContain("addToSameMapBand(");
        expect(gameMapFrontWrapperSource).toContain("coverPhaserLayer.depth + 0.01");
    });
});
