import type { ITiledMap, ITiledMapTileLayer } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    CENTERED_CHUNK_ORIGIN_X_PROPERTY,
    CENTERED_CHUNK_ORIGIN_Y_PROPERTY,
    CENTERED_COORDINATE_SYSTEM,
    CENTERED_COORDINATE_SYSTEM_PROPERTY,
    CENTERED_TILE_OFFSET_X_PROPERTY,
    CENTERED_TILE_OFFSET_Y_PROPERTY,
    getTileLayerGid,
} from "../../src/GameMap/CenteredMapCoordinates";
import { GameMap } from "../../src/GameMap/GameMap";

describe("GameMap resident tile window", () => {
    it("bounds dense flat-layer data while retaining full sparse 4000 by 4000 source geometry", () => {
        const source = createSparseWorld();
        const gameMap = new GameMap(source, undefined, {
            residentTileBounds: { x: -32, y: -16, width: 64, height: 48 },
        });
        const ground = getFlatTileLayer(gameMap, "terrain/ground");

        expect(ground).toMatchObject({ startx: -32, starty: -16, width: 64, height: 48 });
        expect(ground.data).toHaveLength(64 * 48);
        expect(ground.data[tileIndex(ground, -31, -15)]).toBe(7);
        expect(gameMap.getMap()).toMatchObject({ width: 4000, height: 4000 });
        expect(getSourceTileLayer(gameMap.getMap())).toMatchObject({ width: 4000, height: 4000 });
        expect(getSourceTileLayer(gameMap.getMap()).chunks).toHaveLength(4);
        expect(gameMap.getRuntimeMap()).toBe(gameMap.getRuntimeMap());
        expect(gameMap.getRuntimeMap()).toMatchObject({ width: 64, height: 48 });
        expect(getSourceTileLayer(gameMap.getRuntimeMap())).toMatchObject({
            startx: -32,
            starty: -16,
            width: 64,
            height: 48,
        });
        expect(gameMap.getMapBounds()).toEqual({ x: -64_000, y: -64_000, width: 128_000, height: 128_000 });
        expect(gameMap.getResidentTileBounds()).toEqual({ x: -32, y: -16, width: 64, height: 48 });

        expect(gameMap.findLayer("objects")?.type).toBe("objectgroup");
        expect(gameMap.findLayer("backdrop")?.type).toBe("imagelayer");
        expect(gameMap.getObjectWithName("far-away-marker")?.x).toBe(100_000);
    });

    it("shifts signed resident windows and reads and writes source tiles in global coordinates", () => {
        const gameMap = new GameMap(createSparseWorld(), undefined, {
            residentTileBounds: { x: -32, y: -16, width: 8, height: 8 },
        });

        expect(gameMap.getTileInSourceLayer(-31, -15, "terrain/ground")).toBe(7);
        expect(gameMap.getTileInSourceLayerByKey(sourceKey(-31, -15), "terrain/ground")).toBe(7);
        expect(gameMap.getLayersByKey(sourceKey(-31, -15)).map((layer) => layer.name)).toEqual(["terrain/ground"]);
        expect(gameMap.getLayersByKey(sourceKey(65, 66)).map((layer) => layer.name)).toEqual(["terrain/ground"]);
        expect(gameMap.putTileInSourceLayer(17, -31, -15, "terrain/ground")).toBe(true);
        expect(gameMap.getTileInSourceLayer(-31, -15, "terrain/ground")).toBe(17);
        let ground = getFlatTileLayer(gameMap, "terrain/ground");
        expect(ground.data[tileIndex(ground, -31, -15)]).toBe(17);
        expect(getTileLayerGid(getSourceTileLayer(gameMap.getRuntimeMap()), -31, -15)).toBe(17);

        expect(gameMap.putTileInSourceLayer(23, 65, 66, "terrain/ground")).toBe(true);
        expect(ground.data).toHaveLength(8 * 8);

        const previousRuntimeMap = gameMap.getRuntimeMap();
        gameMap.setResidentTileBounds({ x: 64, y: 64, width: 8, height: 8 });
        ground = getFlatTileLayer(gameMap, "terrain/ground");
        expect(gameMap.getRuntimeMap()).not.toBe(previousRuntimeMap);
        expect(gameMap.getRuntimeMap()).toMatchObject({ width: 8, height: 8 });
        expect(ground).toMatchObject({ startx: 64, starty: 64, width: 8, height: 8 });
        expect(ground.data).toHaveLength(8 * 8);
        expect(ground.data[tileIndex(ground, 65, 66)]).toBe(23);
        expect(gameMap.getTileInSourceLayerByKey(sourceKey(65, 66), "terrain/ground")).toBe(23);
        expect(gameMap.getLayersByKey(sourceKey(65, 66)).map((layer) => layer.name)).toEqual(["terrain/ground"]);
        expect(gameMap.getLayersByKey(sourceKey(-31, -15)).map((layer) => layer.name)).toEqual(["terrain/ground"]);
        expect(gameMap.getMapBounds()).toEqual({ x: -64_000, y: -64_000, width: 128_000, height: 128_000 });
    });

    it("keeps synchronization inside the current resident materialization budget", () => {
        const gameMap = new GameMap(createSparseWorld(), undefined, {
            residentTileBounds: { x: 64, y: 64, width: 12, height: 10 },
        });
        const updated = createSparseWorld();
        const updatedGround = getSourceTileLayer(updated);
        const residentChunk = updatedGround.chunks?.find((chunk) => chunk.x === 64 && chunk.y === 64);
        if (residentChunk === undefined || !Array.isArray(residentChunk.data))
            throw new Error("Expected resident chunk");
        residentChunk.data[2 * residentChunk.width + 1] = 31;

        gameMap.synchronizeTileLayers(updated);

        const flatGround = getFlatTileLayer(gameMap, "terrain/ground");
        expect(flatGround).toMatchObject({ startx: 64, starty: 64, width: 12, height: 10 });
        expect(flatGround.data).toHaveLength(12 * 10);
        expect(flatGround.data[tileIndex(flatGround, 65, 66)]).toBe(31);
        expect(gameMap.getTileInSourceLayer(65, 66, "terrain/ground")).toBe(31);
        expect(gameMap.getMap()).toMatchObject({ width: 4000, height: 4000 });
        expect(gameMap.getRuntimeMap()).toMatchObject({ width: 12, height: 10 });
        expect(gameMap.getMapBounds()).toEqual({ x: -64_000, y: -64_000, width: 128_000, height: 128_000 });
        expect(gameMap.getObjectWithName("far-away-marker")).toBeDefined();
    });

    it("preserves full-layer materialization when no resident window is supplied", () => {
        const source = createDenseMap();
        const gameMap = new GameMap(source);
        const ground = getFlatTileLayer(gameMap, "ground");

        expect(gameMap.getResidentTileBounds()).toBeUndefined();
        expect(ground).toMatchObject({ width: 3, height: 2 });
        expect(ground.data).toEqual([1, 2, 3, 4, 5, 6]);
        expect(gameMap.getMap()).toMatchObject({ width: 3, height: 2 });
        expect(gameMap.getRuntimeMap()).toBe(gameMap.getMap());
        expect(gameMap.getTileInSourceLayerByKey(0, "ground")).toBe(1);
        expect(gameMap.getLayersByKey(0).map((layer) => layer.name)).toEqual(["ground"]);
    });
});

function createSparseWorld(): ITiledMap {
    return {
        type: "map",
        tiledversion: "1.10.2",
        orientation: "orthogonal",
        infinite: true,
        width: 4000,
        height: 4000,
        tilewidth: 32,
        tileheight: 32,
        properties: [
            { name: CENTERED_COORDINATE_SYSTEM_PROPERTY, type: "string", value: CENTERED_COORDINATE_SYSTEM },
            { name: CENTERED_CHUNK_ORIGIN_X_PROPERTY, type: "int", value: -2000 },
            { name: CENTERED_CHUNK_ORIGIN_Y_PROPERTY, type: "int", value: -2000 },
            { name: CENTERED_TILE_OFFSET_X_PROPERTY, type: "float", value: 0 },
            { name: CENTERED_TILE_OFFSET_Y_PROPERTY, type: "float", value: 0 },
        ],
        layers: [
            {
                type: "group",
                name: "terrain",
                opacity: 1,
                visible: true,
                layers: [
                    {
                        id: 1,
                        name: "ground",
                        type: "tilelayer",
                        opacity: 1,
                        visible: true,
                        startx: -2000,
                        starty: -2000,
                        width: 4000,
                        height: 4000,
                        data: [],
                        chunks: [
                            { x: -2000, y: -2000, width: 1, height: 1, data: [1] },
                            {
                                x: -32,
                                y: -16,
                                width: 4,
                                height: 4,
                                data: [0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
                            },
                            {
                                x: 64,
                                y: 64,
                                width: 4,
                                height: 4,
                                data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 11, 0, 0, 0, 0, 0, 0],
                            },
                            { x: 1999, y: 1999, width: 1, height: 1, data: [2] },
                        ],
                    },
                ],
            },
            {
                id: 2,
                name: "objects",
                type: "objectgroup",
                opacity: 1,
                visible: true,
                objects: [{ id: 1, name: "far-away-marker", visible: true, x: 100_000, y: 100_000, point: true }],
            },
            {
                id: 3,
                name: "backdrop",
                type: "imagelayer",
                opacity: 1,
                visible: true,
                image: "backdrop.png",
                x: 0,
                y: 0,
            },
        ],
        tilesets: [],
    };
}

function createDenseMap(): ITiledMap {
    return {
        type: "map",
        tiledversion: "1.10.2",
        orientation: "orthogonal",
        infinite: false,
        width: 3,
        height: 2,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            {
                id: 1,
                name: "ground",
                type: "tilelayer",
                opacity: 1,
                visible: true,
                width: 3,
                height: 2,
                data: [1, 2, 3, 4, 5, 6],
            },
        ],
        tilesets: [],
    };
}

function getFlatTileLayer(gameMap: GameMap, name: string): ITiledMapTileLayer & { data: number[] } {
    const layer = gameMap.findLayer(name);
    if (layer?.type !== "tilelayer" || !Array.isArray(layer.data)) throw new Error(`Expected flat tile layer ${name}`);
    return layer as ITiledMapTileLayer & { data: number[] };
}

function getSourceTileLayer(map: ITiledMap): ITiledMapTileLayer {
    const group = map.layers[0];
    if (group?.type !== "group" || group.layers[0]?.type !== "tilelayer") throw new Error("Expected source tile layer");
    return group.layers[0];
}

function tileIndex(layer: ITiledMapTileLayer, tileX: number, tileY: number): number {
    return (tileY - (layer.starty ?? 0)) * layer.width + tileX - (layer.startx ?? 0);
}

function sourceKey(tileX: number, tileY: number): number {
    return tileX + 2000 + (tileY + 2000) * 4000;
}
