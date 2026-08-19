import { describe, expect, it } from "vitest";
import {
    getTileLayerRenderPlacement,
    resolveTileLayerWorldOrigin,
} from "../../../../../src/front/Phaser/Game/GameMap/TilemapRendererSelection";

describe("tilemap renderer coordinates", () => {
    it("keeps a CPU layer directly at its signed world origin", () => {
        const placement = getTileLayerRenderPlacement({ x: -512, y: 416 }, false);

        expect(placement).toEqual({ layer: { x: -512, y: 416 } });
        expect(resolveTileLayerWorldOrigin(placement)).toEqual({ x: -512, y: 416 });
    });

    it("keeps a GPU layer local and applies its signed world origin through its parent", () => {
        const placement = getTileLayerRenderPlacement({ x: -512, y: -416 }, true);

        expect(placement).toEqual({
            layer: { x: 0, y: 0 },
            parent: { x: -512, y: -416 },
        });
        expect(resolveTileLayerWorldOrigin(placement)).toEqual({ x: -512, y: -416 });
    });
});
