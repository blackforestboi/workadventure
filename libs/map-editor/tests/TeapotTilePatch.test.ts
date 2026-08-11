import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import { addTeapotEmbeddedTileset, applyTeapotTilePatch, TeapotTilePatchError } from "../src/Authoring/TeapotTilePatch";

function createMap(): ITiledMap {
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

describe("applyTeapotTilePatch", () => {
    it("updates a bounded region without mutating or dropping unknown source fields", () => {
        const source = Object.assign(createMap(), { teapotUnknown: { keep: true } });
        const result = applyTeapotTilePatch(source, {
            mapId: "world",
            expectedRevision: 0,
            regions: [{ layer: "ground", x: 0, y: 0, width: 2, height: 1, gids: [1, 2] }],
        });

        expect((source.layers[0] as { data: number[] }).data).toEqual([0, 0, 0, 0]);
        expect((result.map.layers[0] as { data: number[] }).data).toEqual([1, 2, 0, 0]);
        expect((result.map as unknown as { teapotUnknown: unknown }).teapotUnknown).toEqual({ keep: true });
        expect(result.changedTiles).toBe(2);
    });

    it("rejects a region that exceeds the layer bounds", () => {
        expect(() =>
            applyTeapotTilePatch(createMap(), {
                mapId: "world",
                expectedRevision: 0,
                regions: [{ layer: "ground", x: 1, y: 1, width: 2, height: 1, gids: [1, 1] }],
            }),
        ).toThrowError(TeapotTilePatchError);
    });
});

describe("addTeapotEmbeddedTileset", () => {
    it("appends a grid-aligned embedded tileset at the next stable GID without mutating the source", () => {
        const source = Object.assign(createMap(), { teapotUnknown: { keep: true } });
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
});
