import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
    CorruptWorldStorageError,
    WORLD_CHUNK_SIZE,
    WorldChunkRepository,
    WorldManifestNotFoundError,
    WorldRevisionConflictError,
    UnknownWorldLayerError,
    type WorldChunkInput,
    type WorldManifestInput,
} from "../WorldChunkRepository";

const worldId = "maps/example/world.tmj";

function manifestInput(): WorldManifestInput {
    return {
        tileSize: { width: 32, height: 32 },
        bounds: { minTileX: -2_000, minTileY: -2_000, width: 4_000, height: 4_000 },
        layers: [
            { id: "ground", name: "Ground", sourceLayerId: 1 },
            { id: "details", name: "Details", sourceLayerId: 2 },
        ],
        source: { format: "tmj", path: "maps/example/world.tmj" },
    };
}

function chunkInput(gid = 7): WorldChunkInput {
    return {
        layers: [
            {
                layerId: "ground",
                spans: [
                    { start: 0, gids: [gid, gid] },
                    { start: WORLD_CHUNK_SIZE + 1, gids: [gid] },
                ],
            },
        ],
    };
}

describe("WorldChunkRepository", () => {
    let storageDirectory: string;
    let repository: WorldChunkRepository;

    beforeEach(async () => {
        storageDirectory = await mkdtemp(path.join(tmpdir(), "world-chunk-repository-"));
        repository = new WorldChunkRepository(storageDirectory);
    });

    afterEach(async () => {
        await rm(storageDirectory, { recursive: true, force: true });
    });

    it("creates and updates a versioned world manifest", async () => {
        expect(await repository.readManifest(worldId)).toBeNull();

        const created = await repository.writeManifest(worldId, 0, manifestInput());
        expect(created).toMatchObject({
            formatVersion: 1,
            revision: 1,
            worldId,
            chunkSize: 64,
            source: { format: "tmj", path: worldId },
        });

        const updated = await repository.writeManifest(worldId, 1, {
            ...manifestInput(),
            bounds: { minTileX: -2_000, minTileY: -2_000, width: 4_096, height: 4_096 },
        });
        expect(updated.revision).toBe(2);
        expect((await repository.readManifest(worldId))?.bounds.width).toBe(4_096);
    });

    it("rejects stale manifest writes without changing durable state", async () => {
        await repository.writeManifest(worldId, 0, manifestInput());
        await repository.writeManifest(worldId, 1, {
            ...manifestInput(),
            bounds: { minTileX: 0, minTileY: 0, width: 4_000, height: 4_000 },
        });

        await expect(repository.writeManifest(worldId, 1, manifestInput())).rejects.toMatchObject({
            name: WorldRevisionConflictError.name,
            expectedRevision: 1,
            actualRevision: 2,
        });
        expect((await repository.readManifest(worldId))?.bounds.minTileX).toBe(0);
    });

    it("treats absent chunk files as sparse missing chunks", async () => {
        await repository.writeManifest(worldId, 0, manifestInput());

        expect(await repository.readChunk(worldId, { x: -32, y: 31 })).toBeNull();
    });

    it("persists sparse tile spans and increments the chunk revision", async () => {
        await repository.writeManifest(worldId, 0, manifestInput());

        const created = await repository.writeChunk(worldId, { x: -32, y: 31 }, 0, chunkInput());
        expect(created).toMatchObject({
            formatVersion: 1,
            revision: 1,
            worldId,
            chunkSize: 64,
            coordinates: { x: -32, y: 31 },
        });
        expect(created.layers[0]?.spans).toEqual([
            { start: 0, gids: [7, 7] },
            { start: 65, gids: [7] },
        ]);

        const updated = await repository.writeChunk(worldId, { x: -32, y: 31 }, 1, chunkInput(8));
        expect(updated.revision).toBe(2);

        await expect(repository.writeChunk(worldId, { x: -32, y: 31 }, 1, chunkInput(9))).rejects.toMatchObject({
            name: WorldRevisionConflictError.name,
            expectedRevision: 1,
            actualRevision: 2,
        });
        expect(
            (await new WorldChunkRepository(storageDirectory).readChunk(worldId, { x: -32, y: 31 }))?.layers,
        ).toEqual(chunkInput(8).layers);
    });

    it("allows only one concurrent create for the same chunk revision", async () => {
        await repository.writeManifest(worldId, 0, manifestInput());

        const results = await Promise.allSettled([
            repository.writeChunk(worldId, { x: 0, y: 0 }, 0, chunkInput(10)),
            repository.writeChunk(worldId, { x: 0, y: 0 }, 0, chunkInput(11)),
        ]);

        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejection = results.find((result) => result.status === "rejected");
        expect(rejection?.status === "rejected" ? rejection.reason : undefined).toBeInstanceOf(
            WorldRevisionConflictError,
        );
        expect((await repository.readChunk(worldId, { x: 0, y: 0 }))?.revision).toBe(1);
    });

    it("requires a manifest and only accepts layers declared by it", async () => {
        await expect(repository.writeChunk(worldId, { x: 0, y: 0 }, 0, chunkInput())).rejects.toBeInstanceOf(
            WorldManifestNotFoundError,
        );

        await repository.writeManifest(worldId, 0, manifestInput());
        await expect(
            repository.writeChunk(worldId, { x: 0, y: 0 }, 0, {
                layers: [{ layerId: "unknown", spans: [{ start: 0, gids: [1] }] }],
            }),
        ).rejects.toBeInstanceOf(UnknownWorldLayerError);
        expect(await repository.readChunk(worldId, { x: 0, y: 0 })).toBeNull();
    });

    it("rejects overlapping and out-of-bounds tile spans", async () => {
        await repository.writeManifest(worldId, 0, manifestInput());

        await expect(
            repository.writeChunk(worldId, { x: 0, y: 0 }, 0, {
                layers: [
                    {
                        layerId: "ground",
                        spans: [
                            { start: 4, gids: [1, 2] },
                            { start: 5, gids: [3] },
                        ],
                    },
                ],
            }),
        ).rejects.toThrow("must not overlap");

        await expect(
            repository.writeChunk(worldId, { x: 0, y: 0 }, 0, {
                layers: [
                    {
                        layerId: "ground",
                        spans: [{ start: WORLD_CHUNK_SIZE * WORLD_CHUNK_SIZE - 1, gids: [1, 2] }],
                    },
                ],
            }),
        ).rejects.toThrow("exceeds the 64x64 chunk");
    });

    it("reports corrupt stored JSON instead of treating it as an absent manifest", async () => {
        const directoryName = createHash("sha256").update(worldId).digest("hex");
        const worldDirectory = path.join(storageDirectory, "worlds", directoryName);
        await mkdir(worldDirectory, { recursive: true });
        await writeFile(path.join(worldDirectory, "manifest.json"), "not-json", "utf8");

        await expect(repository.readManifest(worldId)).rejects.toBeInstanceOf(CorruptWorldStorageError);
    });

    it("leaves no temporary files after successful atomic writes", async () => {
        await repository.writeManifest(worldId, 0, manifestInput());
        const directoryName = createHash("sha256").update(worldId).digest("hex");
        const worldDirectory = path.join(storageDirectory, "worlds", directoryName);

        expect(await readdir(worldDirectory)).toEqual(["manifest.json"]);
    });
});
