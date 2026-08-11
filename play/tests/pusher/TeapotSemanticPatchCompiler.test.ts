// @vitest-environment node

import { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    compileTeapotMapPatch,
    resolveTeapotTilesetImports,
} from "../../src/pusher/teapot/TeapotSemanticPatchCompiler";
import type { TeapotAssetRecord } from "../../src/pusher/teapot/TeapotRecords";

function createMap() {
    return ITiledMap.parse({
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
            {
                id: 2,
                name: "objects",
                objects: [],
                opacity: 1,
                type: "objectgroup",
                visible: true,
                x: 0,
                y: 0,
            },
        ],
        nextlayerid: 3,
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
    });
}

describe("compileTeapotMapPatch", () => {
    it("compiles semantic tile and interaction operations without mutating the source", () => {
        const source = createMap();
        const result = compileTeapotMapPatch(source, {
            mapUrl: "https://maps.example.test/world.tmj",
            expectedRevision: 2,
            title: "Add a garden link",
            rationale: "Make the garden useful",
            operations: [
                { kind: "paint-region", layer: "ground", x: 0, y: 0, width: 1, height: 1, gids: [1] },
                {
                    kind: "place-zone",
                    layer: "objects",
                    clientReference: "garden-link",
                    name: "Garden guide",
                    x: 0,
                    y: 0,
                    width: 32,
                    height: 32,
                    properties: [
                        {
                            kind: "open-website",
                            url: "https://example.test/garden",
                            trigger: "action",
                            triggerMessage: "Read the garden guide",
                        },
                        {
                            kind: "play-audio",
                            url: "https://example.test/garden.ogg",
                            loop: true,
                            volume: 0.6,
                        },
                    ],
                },
            ],
        });

        expect(source.nextobjectid).toBe(1);
        expect(result).toMatchObject({ changedTiles: 1, changedObjects: 1, changedAnimations: 0 });
        expect(result.map.nextobjectid).toBe(2);
        expect(result.map.layers[1]).toMatchObject({
            type: "objectgroup",
            objects: [
                {
                    id: 1,
                    name: "Garden guide",
                    class: "area",
                    type: "area",
                    properties: expect.arrayContaining([
                        { name: "openWebsite", type: "string", value: "https://example.test/garden" },
                        { name: "audioLoop", type: "bool", value: true },
                    ]),
                },
            ],
        });
    });

    it("imports a server-resolved owner tileset and previews its allocated GID range", () => {
        const patch = tilesetImportPatch();
        const result = compileTeapotMapPatch(
            createMap(),
            patch,
            new Map([
                [
                    "tileset_asset_1",
                    {
                        assetId: "tileset_asset_1",
                        name: "Forest floor",
                        image: "https://play.example.test/teapot/tileset-assets/tileset_asset_1.png",
                        imageWidth: 96,
                        imageHeight: 64,
                    },
                ],
            ]),
        );

        expect(result.importedTilesets).toEqual([
            {
                assetId: "tileset_asset_1",
                name: "Forest floor",
                firstGid: 3,
                lastGidExclusive: 9,
                tileCount: 6,
            },
        ]);
        expect(result.map.tilesets[1]).toMatchObject({
            name: "Forest floor",
            firstgid: 3,
            image: "https://play.example.test/teapot/tileset-assets/tileset_asset_1.png",
            imagewidth: 96,
            imageheight: 64,
            tilecount: 6,
        });
    });

    it("resolves only a published tileset owned by the MCP session owner", async () => {
        const valid = tilesetAsset();
        await expect(
            resolveTeapotTilesetImports(
                { getAsset: () => Promise.resolve(valid) },
                "owner-1",
                tilesetImportPatch(),
                "https://play.example.test",
            ),
        ).resolves.toEqual(
            new Map([
                [
                    "tileset_asset_1",
                    {
                        assetId: "tileset_asset_1",
                        name: "Forest floor",
                        image: "https://play.example.test/teapot/tileset-assets/tileset_asset_1.png",
                        imageWidth: 96,
                        imageHeight: 64,
                    },
                ],
            ]),
        );

        const unavailable = [null, { ...valid, ownerId: "owner-2" }, { ...valid, kind: "map-entity" as const }];
        await Promise.all(
            unavailable.map((asset) =>
                expect(
                    resolveTeapotTilesetImports(
                        { getAsset: () => Promise.resolve(asset) },
                        "owner-1",
                        tilesetImportPatch(),
                        "https://play.example.test",
                    ),
                ).rejects.toThrow("unavailable for this owner"),
            ),
        );
    });
});

function tilesetImportPatch() {
    return {
        mapUrl: "https://maps.example.test/world.tmj",
        expectedRevision: 2,
        title: "Import forest tiles",
        rationale: "Use the generated tileset",
        operations: [{ kind: "import-tileset" as const, assetId: "tileset_asset_1", name: "Forest floor" }],
    };
}

function tilesetAsset(): TeapotAssetRecord {
    return {
        id: "tileset_asset_1",
        ownerId: "owner-1",
        objectReference: "opaque.png",
        kind: "tileset",
        mediaType: "image/png",
        metadata: { width: 96, height: 64 },
        published: true,
        createdAt: "2026-08-09T12:00:00.000Z",
        deletedAt: null,
    };
}
