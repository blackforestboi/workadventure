import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import { addTeapotEmbeddedTileset, applyTeapotTilePatch, TeapotTilePatchError } from "../src/Authoring/TeapotTilePatch";
import {
    createCenteredMap,
    getMapWorldBounds,
    getTileLayerGid,
    isCenteredMap,
} from "../src/GameMap/CenteredMapCoordinates";

function createFiniteMap(): ITiledMap {
    return {
        compressionlevel: -1,
        height: 2,
        infinite: false,
        layers: [
            {
                data: [0, 0, 0, 0],
                height: 2,
                id: 1,
                name: "ground",
                opacity: 1,
                type: "tilelayer",
                visible: true,
                width: 2,
                x: 0,
                y: 0,
            },
        ],
        nextlayerid: 2,
        nextobjectid: 1,
        orientation: "orthogonal",
        renderorder: "right-down",
        tiledversion: "1.11.0",
        tileheight: 32,
        tilesets: [
            {
                columns: 2,
                firstgid: 1,
                image: "terrain.png",
                imageheight: 32,
                imagewidth: 64,
                margin: 0,
                name: "terrain",
                spacing: 0,
                tilecount: 2,
                tileheight: 32,
                tilewidth: 32,
            },
        ],
        tilewidth: 32,
        type: "map",
        version: "1.10",
        width: 2,
    };
}

function createMap(): ITiledMap {
    return createCenteredMap(createFiniteMap());
}

function getGround(map: ITiledMap) {
    const layer = map.layers[0];
    if (layer?.type !== "tilelayer") throw new Error("Expected ground tile layer");
    return layer;
}

describe("createCenteredMap", () => {
    it("creates an immutable world origin with signed tile coordinates", () => {
        const map = createMap();

        expect(isCenteredMap(map)).toBe(true);
        expect(map.infinite).toBe(true);
        expect(getGround(map)).toMatchObject({ startx: -1, starty: -1, width: 2, height: 2, data: [] });
        expect(getMapWorldBounds(map)).toEqual({ x: -32, y: -32, width: 64, height: 64 });
    });
});

describe("applyTeapotTilePatch", () => {
    it("updates signed coordinates without mutating or dropping unknown source fields", () => {
        const source = Object.assign(createMap(), { teapotUnknown: { keep: true } });
        const sourceLayer = getGround(source);
        Object.assign(sourceLayer.chunks?.[0] ?? {}, { chunkUnknown: "keep" });

        const result = applyTeapotTilePatch(source, {
            mapId: "world",
            expectedRevision: 0,
            regions: [{ layer: "ground", x: -1, y: -1, width: 2, height: 1, gids: [1, 2] }],
        });

        expect(getTileLayerGid(sourceLayer, -1, -1)).toBe(0);
        expect(getTileLayerGid(getGround(result.map), -1, -1)).toBe(1);
        expect(getTileLayerGid(getGround(result.map), 0, -1)).toBe(2);
        expect((result.map as unknown as { teapotUnknown: unknown }).teapotUnknown).toEqual({ keep: true });
        expect((getGround(result.map).chunks?.[0] as unknown as { chunkUnknown: string }).chunkUnknown).toBe("keep");
        expect(result.changedTiles).toBe(2);
        expect(result.affectedBounds).toEqual({ x: -1, y: -1, width: 2, height: 1 });
    });

    it("expands in every direction while existing tile coordinates stay fixed", () => {
        const source = createMap();
        const seeded = applyTeapotTilePatch(source, {
            mapId: "world",
            expectedRevision: 0,
            regions: [{ layer: "ground", x: -1, y: -1, width: 1, height: 1, gids: [1] }],
        }).map;

        const result = applyTeapotTilePatch(seeded, {
            mapId: "world",
            expectedRevision: 0,
            regions: [
                { layer: "ground", x: -3, y: -2, width: 1, height: 1, gids: [2] },
                { layer: "ground", x: 20, y: 3, width: 1, height: 1, gids: [2] },
            ],
        });

        const ground = getGround(result.map);
        expect(getTileLayerGid(ground, -1, -1)).toBe(1);
        expect(getTileLayerGid(ground, -3, -2)).toBe(2);
        expect(getTileLayerGid(ground, 20, 3)).toBe(2);
        expect(ground.chunks?.some((chunk) => chunk.x < -1)).toBe(true);
        expect(ground.chunks?.some((chunk) => chunk.x > 0)).toBe(true);
    });

    it("updates legacy finite maps without rebasing them", () => {
        const source = createFiniteMap();

        const result = applyTeapotTilePatch(source, {
            mapId: "world",
            expectedRevision: 0,
            regions: [{ layer: "ground", x: 1, y: 0, width: 1, height: 1, gids: [2] }],
        });

        expect(getTileLayerGid(getGround(source), 1, 0)).toBe(0);
        expect(getTileLayerGid(getGround(result.map), 1, 0)).toBe(2);
        expect(result.map.infinite).toBe(false);
        expect(result.map.width).toBe(2);
        expect(result.map.height).toBe(2);
    });

    it("keeps finite edits inside the existing map bounds", () => {
        expect(() =>
            applyTeapotTilePatch(createFiniteMap(), {
                mapId: "world",
                expectedRevision: 0,
                regions: [{ layer: "ground", x: 2, y: 0, width: 1, height: 1, gids: [1] }],
            }),
        ).toThrowError(TeapotTilePatchError);
    });

    it("rejects ordinary infinite maps that do not use centered coordinates", () => {
        const source = createFiniteMap();
        source.infinite = true;

        expect(() =>
            applyTeapotTilePatch(source, {
                mapId: "world",
                expectedRevision: 0,
                regions: [{ layer: "ground", x: 0, y: 0, width: 1, height: 1, gids: [1] }],
            }),
        ).toThrowError(TeapotTilePatchError);
    });
});

describe("addTeapotEmbeddedTileset", () => {
    it("appends a grid-aligned embedded tileset at the next stable GID without mutating the source", () => {
        const source = Object.assign(createFiniteMap(), { teapotUnknown: { keep: true } });
        const result = addTeapotEmbeddedTileset(source, {
            name: "Forest floor",
            image: "https://assets.example.test/forest.png",
            imageWidth: 96,
            imageHeight: 64,
        });

        expect(source.tilesets).toHaveLength(1);
        expect(result.firstGid).toBe(3);
        expect(result.tileCount).toBe(6);
        expect(result.map.tilesets[1]).toMatchObject({
            columns: 3,
            firstgid: 3,
            imagewidth: 96,
            imageheight: 64,
            tilecount: 6,
            tilewidth: 32,
            tileheight: 32,
        });
        expect((result.map as unknown as { teapotUnknown: unknown }).teapotUnknown).toEqual({ keep: true });
    });

    it("rejects images that are not aligned to the 32px grid", () => {
        expect(() =>
            addTeapotEmbeddedTileset(createMap(), {
                name: "Broken",
                image: "broken.png",
                imageWidth: 65,
                imageHeight: 32,
            }),
        ).toThrowError(TeapotTilePatchError);
    });

    it("attaches native Tiled animation metadata to the first logical terrain tile", () => {
        const result = addTeapotEmbeddedTileset(createFiniteMap(), {
            name: "Moving water",
            image: "water.png",
            imageWidth: 128,
            imageHeight: 32,
            animation: {
                frameWidth: 32,
                frameHeight: 32,
                frameCount: 4,
                frameDurationMs: 200,
            },
        });

        expect(result.map.tilesets[result.map.tilesets.length - 1]).toMatchObject({
            columns: 4,
            tilecount: 4,
            tiles: [
                {
                    id: 0,
                    animation: [
                        { tileid: 0, duration: 200 },
                        { tileid: 1, duration: 200 },
                        { tileid: 2, duration: 200 },
                        { tileid: 3, duration: 200 },
                    ],
                },
            ],
        });
    });
});
