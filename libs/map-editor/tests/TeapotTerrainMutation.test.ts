import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    applyTeapotTerrainMutation,
    containsOccupiedVisualTileDeletion,
    createSurfaceOverlayLayer,
    createWaterUnderlayLayer,
    isAvatarSupportingTileLayerName,
    surfaceOverlayCoverLayerName,
    surfaceOverlayLayerName,
    waterUnderlayLayerName,
} from "../src/Authoring/TeapotTerrainMutation";
import { createCenteredMap, getTileLayerGid } from "../src/GameMap/CenteredMapCoordinates";

function createSourceMap(): ITiledMap {
    return createCenteredMap({
        orientation: "orthogonal",
        infinite: false,
        width: 2,
        height: 2,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            {
                id: 1,
                name: "floor",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [1, 2, 3, 4],
                opacity: 1,
                visible: true,
            },
        ],
        tilesets: [
            {
                firstgid: 1,
                name: "terrain",
                image: "terrain.png",
                imagewidth: 320,
                imageheight: 32,
                tilewidth: 32,
                tileheight: 32,
                tilecount: 10,
                columns: 10,
                margin: 0,
                spacing: 0,
            },
        ],
    } as unknown as ITiledMap);
}

function floorLayer(map: ITiledMap) {
    const layer = map.layers[0];
    if (layer?.type !== "tilelayer") throw new Error("Expected floor tile layer");
    return layer;
}

describe("applyTeapotTerrainMutation", () => {
    it("classifies only visual terrain layers as avatar support", () => {
        expect(isAvatarSupportingTileLayerName("floor")).toBe(true);
        expect(isAvatarSupportingTileLayerName("__voidCollisionLayer")).toBe(false);
        expect(isAvatarSupportingTileLayerName("collisions 1")).toBe(false);
        expect(isAvatarSupportingTileLayerName("start 1")).toBe(false);
        expect(isAvatarSupportingTileLayerName("exit")).toBe(false);
    });

    it("detects only occupied visual zero-GID writes", () => {
        const occupied = [{ x: -3, y: -2 }];

        expect(
            containsOccupiedVisualTileDeletion(
                [{ layer: "floor", x: -3, y: -2, width: 1, height: 1, gids: [0] }],
                occupied,
            ),
        ).toBe(true);
        expect(
            containsOccupiedVisualTileDeletion(
                [{ layer: "floor", x: -3, y: -2, width: 1, height: 1, gids: [8] }],
                occupied,
            ),
        ).toBe(false);
        expect(
            containsOccupiedVisualTileDeletion(
                [{ layer: "collisions", x: -3, y: -2, width: 1, height: 1, gids: [0] }],
                occupied,
            ),
        ).toBe(false);
    });

    it("applies a live patch at a negative canonical coordinate", () => {
        const source = createSourceMap();
        const updated = applyTeapotTerrainMutation(source, {
            mapId: "https://example.com/map.tmj",
            regions: [{ layer: "floor", x: -3, y: -2, width: 1, height: 1, gids: [8] }],
        });

        expect(getTileLayerGid(floorLayer(updated), -3, -2)).toBe(8);
        expect(getTileLayerGid(floorLayer(source), -3, -2)).toBe(0);
    });

    it("atomically adds a water underlay before its cover and paints it", () => {
        const source = createSourceMap();
        const layer = createWaterUnderlayLayer(source, "floor");
        const updated = applyTeapotTerrainMutation(source, {
            mapId: "https://example.com/map.tmj",
            regions: [{ layer: layer.name, x: -1, y: -1, width: 1, height: 1, gids: [8] }],
            layerJson: JSON.stringify(layer),
            beforeLayer: "floor",
        });
        const underlay = updated.layers[0];

        expect(underlay?.name).toBe(waterUnderlayLayerName("floor"));
        expect(updated.layers[1]?.name).toBe("floor");
        expect(underlay?.type === "tilelayer" ? getTileLayerGid(underlay, -1, -1) : 0).toBe(8);
        expect(source.layers).toHaveLength(1);
    });

    it("adds a transparent surface overlay above the existing floor", () => {
        const source = createSourceMap();
        const layer = createSurfaceOverlayLayer(source, "floor", 11, "placement-1");
        const updated = applyTeapotTerrainMutation(source, {
            mapId: "https://example.com/map.tmj",
            regions: [{ layer: layer.name, x: -1, y: -1, width: 1, height: 1, gids: [11] }],
            layerJson: JSON.stringify(layer),
        });
        const overlay = updated.layers[1];

        expect(updated.layers[0]?.name).toBe("floor");
        expect(overlay?.name).toBe(surfaceOverlayLayerName("floor", 11, "placement-1"));
        expect(surfaceOverlayCoverLayerName(overlay?.name ?? "")).toBe("floor");
        expect(overlay?.type === "tilelayer" ? getTileLayerGid(overlay, -1, -1) : 0).toBe(11);
        expect(getTileLayerGid(floorLayer(updated), -1, -1)).toBe(1);
    });

    it("applies inverse surface writes before removing a water underlay", () => {
        const source = createSourceMap();
        const layer = createWaterUnderlayLayer(source, "floor");
        const added = applyTeapotTerrainMutation(source, {
            mapId: "https://example.com/map.tmj",
            regions: [{ layer: layer.name, x: -1, y: -1, width: 1, height: 1, gids: [8] }],
            layerJson: JSON.stringify(layer),
            beforeLayer: "floor",
        });
        const removed = applyTeapotTerrainMutation(added, {
            mapId: "https://example.com/map.tmj",
            regions: [{ layer: "floor", x: -1, y: -1, width: 1, height: 1, gids: [1] }],
            layerJson: JSON.stringify(layer),
            removeLayer: true,
            beforeLayer: "floor",
        });

        expect(removed.layers.map((candidate) => candidate.name)).toEqual(["floor"]);
        expect(getTileLayerGid(floorLayer(removed), -1, -1)).toBe(1);
    });

    it("adds and removes an embedded tileset", () => {
        const source = createSourceMap();
        const tileset = {
            firstgid: 11,
            name: "generated",
            image: "generated.png",
            imagewidth: 32,
            imageheight: 32,
            tilewidth: 32,
            tileheight: 32,
            tilecount: 1,
            columns: 1,
            margin: 0,
            spacing: 0,
        };
        const added = applyTeapotTerrainMutation(source, {
            mapId: "https://example.com/map.tmj",
            regions: [],
            tilesetJson: JSON.stringify(tileset),
        });
        const removed = applyTeapotTerrainMutation(added, {
            mapId: "https://example.com/map.tmj",
            regions: [],
            tilesetJson: JSON.stringify(tileset),
            removeTileset: true,
        });

        expect(added.tilesets).toHaveLength(2);
        expect(removed.tilesets).toEqual(source.tilesets);
    });

    it("does not remove a tileset referenced by an infinite chunk", () => {
        const source = createSourceMap();
        const tileset = {
            firstgid: 11,
            name: "generated",
            image: "generated.png",
            imagewidth: 32,
            imageheight: 32,
            tilewidth: 32,
            tileheight: 32,
            tilecount: 1,
            columns: 1,
            margin: 0,
            spacing: 0,
        };
        const added = applyTeapotTerrainMutation(source, {
            mapId: "https://example.com/map.tmj",
            regions: [],
            tilesetJson: JSON.stringify(tileset),
        });
        const painted = applyTeapotTerrainMutation(added, {
            mapId: "https://example.com/map.tmj",
            regions: [{ layer: "floor", x: 5, y: -4, width: 1, height: 1, gids: [11] }],
        });

        expect(() =>
            applyTeapotTerrainMutation(painted, {
                mapId: "https://example.com/map.tmj",
                regions: [],
                tilesetJson: JSON.stringify(tileset),
                removeTileset: true,
            }),
        ).toThrow("Undo painted tiles");
    });
});
