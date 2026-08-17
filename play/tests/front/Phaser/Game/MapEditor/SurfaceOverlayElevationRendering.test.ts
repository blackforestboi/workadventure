import { surfaceOverlayLayerName, waterUnderlayLayerName } from "@workadventure/map-editor";
import type { ITiledMapTileLayer } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    getCompositeTileLayerBaseName,
    getCompositeTileLayerDepthOffset,
} from "../../../../../src/front/Phaser/Game/GameMap/CompositeTileLayerOrder";
import gameMapFrontWrapperSource from "../../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper.ts?raw";
import floorEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts?raw";

function layer(name: string): ITiledMapTileLayer {
    return { id: 1, name, type: "tilelayer", data: [1], width: 1, height: 1 } as ITiledMapTileLayer;
}

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
        expect(gameMapFrontWrapperSource).toContain("getCompositeTileLayerDepthOffset");
    });

    it("restores water beneath an elevated surface in the same render band after reload", () => {
        expect(gameMapFrontWrapperSource).toContain("waterUnderlayCoverLayerName(layer.name)");
        expect(gameMapFrontWrapperSource).toContain("resolveLayerRenderBand(coverLayerName)");
    });

    it("orders nested water between lower and upper surfaces", () => {
        const floor = layer("floor");
        const lowerSurface = layer(surfaceOverlayLayerName("floor", 101, "lower"));
        const upperSurface = layer(surfaceOverlayLayerName("floor", 201, "upper"));
        const upperWater = layer(waterUnderlayLayerName(upperSurface.name));
        const layers = [floor, lowerSurface, upperWater, upperSurface];

        expect(getCompositeTileLayerBaseName(upperWater.name)).toBe("floor");
        expect(getCompositeTileLayerDepthOffset(layers, lowerSurface.name)).toBeLessThan(
            getCompositeTileLayerDepthOffset(layers, upperWater.name),
        );
        expect(getCompositeTileLayerDepthOffset(layers, upperWater.name)).toBeLessThan(
            getCompositeTileLayerDepthOffset(layers, upperSurface.name),
        );
    });
});
