import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WorldChunkRepository, type WorldChunkInput } from "../WorldChunkRepository";
import { TmjWorldChunkBridge, convertTmjToWorldChunks } from "../TmjWorldChunkBridge";

const worldId = "maps/large-centered-world.tmj";
const flippedGid = 0x80000000 + 17;

function tileChunk(x: number, y: number, entries: Array<[number, number, number]>) {
    const data = Array<number>(16 * 16).fill(0);
    for (const [localX, localY, gid] of entries) data[localY * 16 + localX] = gid;
    return { x, y, width: 16, height: 16, data };
}

function largeSparseMap(): ITiledMap {
    return {
        compressionlevel: -1,
        height: 4_000,
        infinite: true,
        layers: [
            {
                id: 10,
                name: "Terrain",
                type: "group",
                opacity: 1,
                visible: true,
                layers: [
                    {
                        id: 11,
                        name: "Ground",
                        type: "tilelayer",
                        opacity: 1,
                        visible: true,
                        width: 4_000,
                        height: 4_000,
                        startx: -2_000,
                        starty: -2_000,
                        data: [],
                        chunks: [
                            tileChunk(-2_000, -2_000, [[0, 0, flippedGid]]),
                            tileChunk(-1_984, -2_000, []),
                            tileChunk(1_984, 1_984, [[15, 15, 23]]),
                        ],
                    },
                ],
            },
            {
                id: 12,
                name: "Details",
                type: "tilelayer",
                opacity: 1,
                visible: true,
                width: 4_000,
                height: 4_000,
                startx: -2_000,
                starty: -2_000,
                data: [],
                chunks: [tileChunk(-16, -16, [[15, 15, 91]])],
            },
        ],
        nextlayerid: 13,
        nextobjectid: 1,
        orientation: "orthogonal",
        renderorder: "right-down",
        tiledversion: "1.11.2",
        tileheight: 32,
        tilesets: [],
        tilewidth: 32,
        type: "map",
        version: "1.10",
        width: 4_000,
    } as unknown as ITiledMap;
}

function findTileLayer(layers: readonly ITiledMapLayer[], id: number): Extract<ITiledMapLayer, { type: "tilelayer" }> {
    for (const layer of layers) {
        if (layer.type === "group") {
            const child = findTileLayerOrUndefined(layer.layers, id);
            if (child !== undefined) return child;
        } else if (layer.type === "tilelayer" && layer.id === id) return layer;
    }
    throw new Error(`Missing tile layer ${id}`);
}

function findTileLayerOrUndefined(
    layers: readonly ITiledMapLayer[],
    id: number,
): Extract<ITiledMapLayer, { type: "tilelayer" }> | undefined {
    try {
        return findTileLayer(layers, id);
    } catch {
        return undefined;
    }
}

describe("TmjWorldChunkBridge", () => {
    let storageDirectory: string;
    let repository: WorldChunkRepository;
    let bridge: TmjWorldChunkBridge;

    beforeEach(async () => {
        storageDirectory = await mkdtemp(path.join(tmpdir(), "tmj-world-chunk-bridge-"));
        repository = new WorldChunkRepository(storageDirectory);
        bridge = new TmjWorldChunkBridge(repository);
    });

    afterEach(async () => {
        await rm(storageDirectory, { recursive: true, force: true });
    });

    it("imports a sparse 4000x4000 grouped map without emitting empty chunks", () => {
        const imported = convertTmjToWorldChunks(largeSparseMap(), worldId);

        expect(imported.manifest).toMatchObject({
            bounds: { minTileX: -2_000, minTileY: -2_000, width: 4_000, height: 4_000 },
            tileSize: { width: 32, height: 32 },
            layers: [
                { id: "11", name: "Ground", sourceLayerId: 11 },
                { id: "12", name: "Details", sourceLayerId: 12 },
            ],
        });
        expect(imported.chunks.map((chunk) => chunk.coordinates)).toEqual([
            { x: -32, y: -32 },
            { x: -1, y: -1 },
            { x: 31, y: 31 },
        ]);
        expect(imported.chunks).toHaveLength(3);

        const negative = imported.chunks[0];
        expect(negative?.input.layers).toEqual([
            { layerId: "11", spans: [{ start: 48 * 64 + 48, gids: [flippedGid] }] },
        ]);
    });

    it("persists and reads one edited chunk back as a bounded TMJ with 16x16 source chunks", async () => {
        const source = largeSparseMap();
        const persisted = await bridge.importMap(worldId, source);
        const original = persisted.chunks.find((chunk) => chunk.coordinates.x === -32 && chunk.coordinates.y === -32);
        expect(original).toBeDefined();

        const editedInput: WorldChunkInput = {
            layers: [
                {
                    layerId: "11",
                    spans: [
                        { start: 0, gids: [77] },
                        { start: 48 * 64 + 48, gids: [flippedGid] },
                    ],
                },
            ],
        };
        await repository.writeChunk(worldId, { x: -32, y: -32 }, original?.revision ?? 0, editedInput);

        const tmj = await bridge.readChunkAsTmj(worldId, { x: -32, y: -32 }, source);
        expect(tmj).not.toBeNull();
        expect(tmj).toMatchObject({ width: 64, height: 64 });
        const ground = findTileLayer(tmj?.layers ?? [], 11);
        expect(ground).toMatchObject({ startx: -2_048, starty: -2_048, width: 64, height: 64, data: [] });
        expect(ground.chunks).toHaveLength(2);

        const topLeftChunk = ground.chunks?.find((chunk) => chunk.x === -2_048 && chunk.y === -2_048);
        const originalSourceChunk = ground.chunks?.find((chunk) => chunk.x === -2_000 && chunk.y === -2_000);
        expect(topLeftChunk?.data[0]).toBe(77);
        expect(originalSourceChunk?.data[0]).toBe(flippedGid);
        expect(source.width).toBe(4_000);
        expect(findTileLayer(source.layers, 11).chunks).toHaveLength(3);
    });
});
