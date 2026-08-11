import { describe, expect, it } from "vitest";

import {
    GeneratedAssetLocalStore,
    GeneratedAssetLocalStoreError,
    type GeneratedAssetLocalStorage,
} from "../../../src/front/Services/GeneratedAssetLocalStore";
import type { TeapotGeneratedAssetView } from "../../../src/front/Services/TeapotGeneratedAssetApi";

const SHA256_A = "a".repeat(64);
const SHA256_B = "b".repeat(64);

class MemoryGeneratedAssetStorage implements GeneratedAssetLocalStorage {
    public failList: Error | undefined;
    public failWrite: Error | undefined;
    private readonly records = new Map<string, unknown>();

    public list(): Promise<unknown[]> {
        if (this.failList !== undefined) return Promise.reject(this.failList);
        return Promise.resolve([...this.records.values()].map(cloneStoredRecord));
    }

    public write(record: { storageKey: string }, removeStorageKeys: readonly string[]): Promise<void> {
        if (this.failWrite !== undefined) return Promise.reject(this.failWrite);
        this.records.set(record.storageKey, cloneStoredRecord(record));
        for (const storageKey of removeStorageKeys) this.records.delete(storageKey);
        return Promise.resolve();
    }

    public remove(storageKey: string): Promise<void> {
        this.records.delete(storageKey);
        return Promise.resolve();
    }

    public insertRaw(storageKey: string, value: unknown): void {
        this.records.set(storageKey, value);
    }
}

function cloneStoredRecord(record: unknown): unknown {
    const cloned = structuredClone(record);
    if (
        typeof record === "object" &&
        record !== null &&
        "png" in record &&
        typeof cloned === "object" &&
        cloned !== null
    ) {
        return { ...cloned, png: record.png };
    }
    return cloned;
}

function makeStore(
    storage: MemoryGeneratedAssetStorage,
    retention: { maxRecords?: number; maxBytes?: number } = {},
    timestamp = "2026-08-12T09:00:00.000Z",
): GeneratedAssetLocalStore {
    return new GeneratedAssetLocalStore(storage, retention, () => new Date(timestamp));
}

function png(bytes: number[]): Blob {
    return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

describe("generated map asset local storage", () => {
    it("restores exact PNG bytes and metadata from a new store instance", async () => {
        const storage = new MemoryGeneratedAssetStorage();
        const original = png([137, 80, 78, 71, 0, 255, 42]);

        await makeStore(storage).upsert("anonymous", {
            clientId: "client-1",
            name: "  Forest shrine  ",
            png: original,
            sha256: SHA256_A,
            provenance: { providerId: "openrouter", modelId: "image-model" },
            syncStatus: "pending",
        });

        const restored = await makeStore(storage).list("anonymous");
        expect(restored).toHaveLength(1);
        expect(restored[0]).toMatchObject({
            clientId: "client-1",
            ownerScope: "anonymous",
            name: "Forest shrine",
            sha256: SHA256_A,
            provenance: { providerId: "openrouter", modelId: "image-model" },
            syncStatus: "pending",
            createdAt: "2026-08-12T09:00:00.000Z",
            updatedAt: "2026-08-12T09:00:00.000Z",
        });
        expect(new Uint8Array(await restored[0]?.png.arrayBuffer())).toEqual(
            new Uint8Array([137, 80, 78, 71, 0, 255, 42]),
        );
    });

    it("merges a server view into its stable client record without replacing the cached PNG", async () => {
        const storage = new MemoryGeneratedAssetStorage();
        const store = makeStore(storage);
        await store.upsert("user-a", {
            clientId: "client-1",
            name: "Lantern",
            png: png([1, 2, 3]),
            sha256: SHA256_A,
            provenance: { providerId: "codex-cli", modelId: "gpt-image" },
            syncStatus: "pending",
        });
        const serverAsset: TeapotGeneratedAssetView = {
            id: "server-asset-1",
            name: "Lantern",
            url: "/teapot/generated-assets/server-asset-1.png",
            kind: "map-entity",
            width: 256,
            height: 256,
            sha256: SHA256_A,
            createdAt: "2026-08-12T09:01:00.000Z",
        };

        await makeStore(storage, {}, "2026-08-12T09:02:00.000Z").upsert("user-a", {
            clientId: "client-1",
            syncStatus: "synced",
            serverAsset,
        });

        const records = await makeStore(storage).list("user-a");
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({ clientId: "client-1", syncStatus: "synced", serverAsset });
        expect(new Uint8Array(await records[0]?.png.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("skips a malformed sibling without hiding valid records", async () => {
        const storage = new MemoryGeneratedAssetStorage();
        await makeStore(storage).upsert("user-a", {
            clientId: "valid",
            name: "Valid asset",
            png: png([1]),
            sha256: SHA256_A,
            provenance: { providerId: "fake", modelId: "fake-image" },
            syncStatus: "pending",
        });
        storage.insertRaw("broken", { version: 1, clientId: "broken", png: "not a blob" });

        await expect(makeStore(storage).list("user-a")).resolves.toMatchObject([{ clientId: "valid" }]);
    });

    it("surfaces read failures as persistence errors", async () => {
        const storage = new MemoryGeneratedAssetStorage();
        storage.failList = new Error("open failed");

        await expect(makeStore(storage).list("user-a")).rejects.toBeInstanceOf(GeneratedAssetLocalStoreError);
    });

    it("does not delete a readable record when a quota write fails", async () => {
        const storage = new MemoryGeneratedAssetStorage();
        const store = makeStore(storage);
        await store.upsert("user-a", {
            clientId: "existing",
            name: "Existing",
            png: png([1]),
            sha256: SHA256_A,
            provenance: { providerId: "fake", modelId: "fake-image" },
            syncStatus: "synced",
        });
        storage.failWrite = new DOMException("Quota exceeded", "QuotaExceededError");

        await expect(
            store.upsert("user-a", {
                clientId: "new",
                name: "New",
                png: png([2]),
                sha256: SHA256_B,
                provenance: { providerId: "fake", modelId: "fake-image" },
                syncStatus: "pending",
            }),
        ).rejects.toBeInstanceOf(GeneratedAssetLocalStoreError);
        storage.failWrite = undefined;
        await expect(store.list("user-a")).resolves.toMatchObject([{ clientId: "existing" }]);
    });

    it("evicts oldest synced records for count and byte limits while retaining unsynced records", async () => {
        const storage = new MemoryGeneratedAssetStorage();
        await makeStore(storage, { maxRecords: 2, maxBytes: 4 }, "2026-08-12T09:00:00.000Z").upsert("user-a", {
            clientId: "pending-oldest",
            name: "Pending",
            png: png([1, 1, 1]),
            sha256: SHA256_A,
            provenance: { providerId: "fake", modelId: "one" },
            syncStatus: "pending",
        });
        await makeStore(storage, { maxRecords: 2, maxBytes: 4 }, "2026-08-12T09:01:00.000Z").upsert("user-a", {
            clientId: "synced-oldest",
            name: "Old synced",
            png: png([2, 2]),
            sha256: SHA256_B,
            provenance: { providerId: "fake", modelId: "two" },
            syncStatus: "synced",
        });
        await makeStore(storage, { maxRecords: 2, maxBytes: 4 }, "2026-08-12T09:02:00.000Z").upsert("user-a", {
            clientId: "synced-newest",
            name: "New synced",
            png: png([3]),
            sha256: "c".repeat(64),
            provenance: { providerId: "fake", modelId: "three" },
            syncStatus: "synced",
        });

        const records = await makeStore(storage).list("user-a");
        expect(records.map((record) => record.clientId)).toEqual(["synced-newest", "pending-oldest"]);
    });

    it("isolates anonymous and authenticated owner scopes", async () => {
        const storage = new MemoryGeneratedAssetStorage();
        const store = makeStore(storage);
        await store.upsert("anonymous", {
            clientId: "same-client-id",
            name: "Anonymous asset",
            png: png([1]),
            sha256: SHA256_A,
            provenance: { providerId: "fake", modelId: "one" },
            syncStatus: "pending",
        });
        await store.upsert("user-uuid-a", {
            clientId: "same-client-id",
            name: "Account asset",
            png: png([2]),
            sha256: SHA256_B,
            provenance: { providerId: "fake", modelId: "two" },
            syncStatus: "synced",
        });

        await expect(store.list("anonymous")).resolves.toMatchObject([{ name: "Anonymous asset" }]);
        await expect(store.list("user-uuid-a")).resolves.toMatchObject([{ name: "Account asset" }]);
        await expect(store.list("user-uuid-b")).resolves.toEqual([]);

        await store.remove("anonymous", "same-client-id");
        await expect(store.list("anonymous")).resolves.toEqual([]);
        await expect(store.list("user-uuid-a")).resolves.toMatchObject([{ name: "Account asset" }]);
    });
});
