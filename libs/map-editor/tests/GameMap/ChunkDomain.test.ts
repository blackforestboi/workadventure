import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    STREAMED_TILE_CHUNK_SIZE,
    SparseLayerChunkStore,
    chunkCoordinatesToKey,
    chunkKeyToCoordinates,
    getChunkTileBounds,
    getChunkWorldBounds,
    projectTiledMapToTileBounds,
    selectActiveChunks,
    tileBoundsToChunkBounds,
    tileToChunkLocation,
    worldBoundsToChunkBounds,
    worldBoundsToTileBounds,
} from "../../src/GameMap/ChunkDomain";

describe("ChunkDomain", () => {
    describe("coordinates and bounds", () => {
        it("uses stable keys and 64 by 64 tile chunks on both sides of the origin", () => {
            expect(STREAMED_TILE_CHUNK_SIZE).toBe(64);
            expect(chunkCoordinatesToKey({ x: -2, y: 3 })).toBe("-2,3");
            expect(chunkKeyToCoordinates("-2,3")).toEqual({ x: -2, y: 3 });
            expect(tileToChunkLocation(-1, -65)).toEqual({
                chunk: { x: -1, y: -2 },
                localX: 63,
                localY: 63,
                localIndex: 4095,
            });
            expect(getChunkTileBounds({ x: -1, y: 2 })).toEqual({ x: -64, y: 128, width: 64, height: 64 });
            expect(getChunkWorldBounds({ x: -1, y: 2 }, 32, 16)).toEqual({
                x: -2048,
                y: 2048,
                width: 2048,
                height: 1024,
            });
        });

        it("converts half-open tile and world bounds without loading unrelated chunks", () => {
            expect(tileBoundsToChunkBounds({ x: -65, y: 63, width: 130, height: 2 })).toEqual({
                minX: -2,
                minY: 0,
                maxXExclusive: 2,
                maxYExclusive: 2,
                width: 4,
                height: 2,
            });
            expect(worldBoundsToTileBounds({ x: -1, y: 2047, width: 2050, height: 2 }, 32, 32)).toEqual({
                x: -1,
                y: 63,
                width: 66,
                height: 2,
            });
            expect(worldBoundsToChunkBounds({ x: -1, y: 2047, width: 2050, height: 2 }, 32, 32)).toEqual({
                minX: -1,
                minY: 0,
                maxXExclusive: 2,
                maxYExclusive: 2,
                width: 3,
                height: 2,
            });
        });

        it("rejects malformed keys and non-positive viewports", () => {
            expect(() => chunkKeyToCoordinates("1:2")).toThrow("Invalid chunk key");
            expect(() => worldBoundsToTileBounds({ x: 0, y: 0, width: 0, height: 1 }, 32, 32)).toThrow(
                "World bounds width must be positive",
            );
        });
    });

    describe("active viewport selection", () => {
        it("prioritizes every core chunk before adding a one-chunk halo", () => {
            const selection = selectActiveChunks(
                { x: 0, y: 0, width: 4096, height: 2048 },
                { tileWidth: 32, tileHeight: 32, maxActiveChunks: 8 },
            );

            expect(selection.coreBounds).toEqual({
                minX: 0,
                minY: 0,
                maxXExclusive: 2,
                maxYExclusive: 1,
                width: 2,
                height: 1,
            });
            expect(selection.core).toHaveLength(2);
            expect(selection.halo).toHaveLength(6);
            expect(selection.requiredCoreChunkCount).toBe(2);
            expect(selection.candidateChunkCount).toBe(12);
            expect(selection.isCoreTruncated).toBe(false);
            expect(selection.isHaloTruncated).toBe(true);
        });

        it("caps a far-zoomed viewport without enumerating its entire full-detail core", () => {
            const selection = selectActiveChunks(
                { x: 0, y: 0, width: 4000 * 32, height: 4000 * 32 },
                { tileWidth: 32, tileHeight: 32, maxActiveChunks: 25, haloChunks: 1 },
            );

            expect(selection.requiredCoreChunkCount).toBe(63 * 63);
            expect(selection.core).toHaveLength(25);
            expect(selection.halo).toEqual([]);
            expect(selection.isCoreTruncated).toBe(true);
            expect(selection.isHaloTruncated).toBe(true);
            expect(selection.core).toContainEqual({ x: 31, y: 31 });
        });

        it("handles signed world coordinates and can disable the halo", () => {
            const selection = selectActiveChunks(
                { x: -2048, y: -2048, width: 64, height: 64 },
                { tileWidth: 32, tileHeight: 32, maxActiveChunks: 4, haloChunks: 0 },
            );

            expect(selection.core).toEqual([{ x: -1, y: -1 }]);
            expect(selection.halo).toEqual([]);
            expect(selection.candidateChunkCount).toBe(1);
            expect(selection.isCoreTruncated).toBe(false);
            expect(selection.isHaloTruncated).toBe(false);
        });
    });

    describe("SparseLayerChunkStore", () => {
        it("stores only populated tiles and partitions them by layer and chunk", () => {
            const store = new SparseLayerChunkStore<number>();

            store.set("ground", -1, -1, 7);
            store.set("ground", 64, 0, 8);
            store.set("details", -1, -1, 9);

            expect(store.layerCount).toBe(2);
            expect(store.chunkCount).toBe(3);
            expect(store.tileCount).toBe(3);
            expect(store.get("ground", -1, -1)).toBe(7);
            expect(store.get("ground", 0, 0)).toBeUndefined();
            expect(store.getLayerChunks("ground")).toEqual([
                { x: -1, y: -1 },
                { x: 1, y: 0 },
            ]);
            expect(Array.from(store.getChunkTiles("ground", { x: -1, y: -1 }))).toEqual([
                { tileX: -1, tileY: -1, value: 7 },
            ]);
        });

        it("updates in place and releases empty chunks and layers", () => {
            const store = new SparseLayerChunkStore<number>();
            store.set("ground", 0, 0, 1);
            store.set("ground", 0, 0, 2);

            expect(store.tileCount).toBe(1);
            expect(store.delete("ground", 0, 0)).toBe(true);
            expect(store.delete("ground", 0, 0)).toBe(false);
            expect(store.tileCount).toBe(0);
            expect(store.chunkCount).toBe(0);
            expect(store.layerCount).toBe(0);
        });

        it("deletes a chunk or an entire layer without affecting other layers", () => {
            const store = new SparseLayerChunkStore<number>();
            store.set("ground", 0, 0, 1);
            store.set("ground", 64, 0, 2);
            store.set("details", 0, 0, 3);

            expect(store.deleteChunk("ground", { x: 0, y: 0 })).toBe(true);
            expect(store.tileCount).toBe(2);
            expect(store.hasChunk("ground", { x: 1, y: 0 })).toBe(true);
            expect(store.clearLayer("ground")).toBe(true);
            expect(store.tileCount).toBe(1);
            expect(store.get("details", 0, 0)).toBe(3);
        });
    });

    describe("projectTiledMapToTileBounds", () => {
        it("clips signed chunk edges and leaves the source map untouched", () => {
            const source = createChunkedMap();
            const sourceSnapshot = structuredClone(source);

            const projected = projectTiledMapToTileBounds(source, { x: -1, y: -1, width: 2, height: 2 });
            const ground = getTileLayer(projected.layers[0]);

            expect(projected).toMatchObject({ width: 2, height: 2 });
            expect(ground).toMatchObject({ startx: -1, starty: -1, width: 2, height: 2, x: 0, y: 0, data: [] });
            expect(ground.chunks).toEqual([
                {
                    x: -1,
                    y: -1,
                    width: 2,
                    height: 2,
                    data: [303, 304, 403, 404],
                },
            ]);
            expect(source).toEqual(sourceSnapshot);
            expect(projected).not.toBe(source);
            expect(projected.layers).not.toBe(source.layers);
        });

        it("recurses through groups and keeps object layers available as independent clones", () => {
            const source = createChunkedMap();
            const nestedTileLayer = getTileLayer(source.layers[0]);
            source.layers = [
                {
                    type: "group",
                    name: "terrain",
                    opacity: 1,
                    visible: true,
                    layers: [nestedTileLayer],
                },
                {
                    type: "objectgroup",
                    name: "objects",
                    opacity: 1,
                    visible: true,
                    objects: [{ id: 1, name: "remote-marker", visible: true, x: 100_000, y: 100_000, point: true }],
                },
            ];

            const projected = projectTiledMapToTileBounds(source, { x: -2, y: -2, width: 4, height: 4 });
            const group = projected.layers[0];
            const objects = projected.layers[1];

            if (group?.type !== "group" || objects?.type !== "objectgroup")
                throw new Error("Expected projected layers");
            expect(getTileLayer(group.layers[0])).toMatchObject({ startx: -2, starty: -2, width: 4, height: 4 });
            expect(objects.objects).toEqual(source.layers[1]?.type === "objectgroup" ? source.layers[1].objects : []);
            expect(objects).not.toBe(source.layers[1]);
            expect(objects.objects).not.toBe(source.layers[1]?.type === "objectgroup" ? source.layers[1].objects : []);
        });

        it("projects finite dense layers into the resident window", () => {
            const source = createChunkedMap();
            source.infinite = false;
            source.layers = [
                {
                    id: 3,
                    name: "dense",
                    type: "tilelayer",
                    opacity: 1,
                    visible: true,
                    startx: -2,
                    starty: -1,
                    width: 4,
                    height: 2,
                    data: [1, 2, 3, 4, 5, 6, 7, 8],
                },
            ];

            const projected = projectTiledMapToTileBounds(source, { x: -1, y: -2, width: 2, height: 4 });

            expect(getTileLayer(projected.layers[0]).data).toEqual([0, 0, 2, 3, 6, 7, 0, 0]);
        });

        it("rejects intersecting encoded tile payloads that cannot be clipped safely", () => {
            const source = createChunkedMap();
            const ground = getTileLayer(source.layers[0]);
            const chunk = ground.chunks?.[0];
            if (chunk === undefined) throw new Error("Expected source chunk");
            chunk.data = "encoded";

            expect(() => projectTiledMapToTileBounds(source, { x: -1, y: -1, width: 2, height: 2 })).toThrow(
                "Cannot project encoded tile chunk at -4,-4",
            );
        });
    });
});

function createChunkedMap(): ITiledMap {
    return {
        type: "map",
        tiledversion: "1.10.2",
        orientation: "orthogonal",
        infinite: true,
        width: 8,
        height: 8,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            {
                id: 1,
                name: "ground",
                type: "tilelayer",
                opacity: 1,
                visible: true,
                startx: -4,
                starty: -4,
                width: 8,
                height: 8,
                data: [],
                chunks: [
                    {
                        x: -4,
                        y: -4,
                        width: 8,
                        height: 8,
                        data: Array.from({ length: 64 }, (_, index) => Math.floor(index / 8) * 100 + (index % 8)),
                    },
                    { x: 64, y: 64, width: 1, height: 1, data: [999] },
                ],
            },
        ],
        tilesets: [],
    };
}

function getTileLayer(layer: ITiledMap["layers"][number] | undefined) {
    if (layer?.type !== "tilelayer") throw new Error("Expected tile layer");
    return layer;
}
