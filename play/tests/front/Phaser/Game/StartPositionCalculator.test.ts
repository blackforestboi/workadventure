import { createCenteredMap, materializeTileLayerData } from "@workadventure/map-editor";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import type { GameMapFrontWrapper } from "../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper";
import { computeStartPosition } from "../../../../src/front/Phaser/Game/StartPositionCalculator";

describe("computeStartPosition", () => {
    it("resolves a signed start tile against the immutable central origin", () => {
        const map = createCenteredMap({
            orientation: "orthogonal",
            infinite: false,
            width: 2,
            height: 2,
            tilewidth: 32,
            tileheight: 32,
            layers: [
                {
                    id: 1,
                    name: "start",
                    type: "tilelayer",
                    width: 2,
                    height: 2,
                    data: [1, 0, 0, 0],
                    opacity: 1,
                    visible: true,
                },
            ],
            tilesets: [],
        } as unknown as ITiledMap);
        const rawLayer = map.layers[0];
        if (rawLayer?.type !== "tilelayer") throw new Error("Expected start tile layer");
        const runtimeLayer = { ...rawLayer, data: materializeTileLayerData(rawLayer) };
        const gameMapFrontWrapper = {
            dynamicAreas: new Map(),
            getAreaByName: () => undefined,
            getFlatLayers: () => [runtimeLayer],
            getRandomPositionFromLayer: () => ({ x: 0, y: 0 }),
        } as unknown as GameMapFrontWrapper;

        expect(computeStartPosition(gameMapFrontWrapper, map, undefined, "start")).toEqual({ x: -16, y: -16 });
    });
});
