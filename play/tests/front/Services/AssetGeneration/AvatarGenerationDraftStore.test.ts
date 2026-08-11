import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    AvatarGenerationDraftStore,
    type AvatarGenerationDraftStorage,
} from "../../../../src/front/Services/AssetGeneration/AvatarGenerationDraftStore";

class MemoryDraftStorage implements AvatarGenerationDraftStorage {
    private readonly records = new Map<string, unknown>();

    public load(): Promise<unknown> {
        return Promise.resolve(this.records.get("active"));
    }

    public list(): Promise<unknown[]> {
        return Promise.resolve([...this.records.values()]);
    }

    public save(record: unknown): Promise<void> {
        if (typeof record !== "object" || record === null || !("id" in record) || typeof record.id !== "string") {
            return Promise.reject(new Error("Invalid draft record"));
        }
        this.records.set(record.id, record);
        return Promise.resolve();
    }

    public delete(): Promise<void> {
        this.records.delete("active");
        return Promise.resolve();
    }

    public get(id: string): unknown {
        return this.records.get(id);
    }
}

describe("avatar generation draft storage", () => {
    let storage: MemoryDraftStorage;
    let store: AvatarGenerationDraftStore;

    beforeEach(() => {
        localStorage.clear();
        storage = new MemoryDraftStorage();
        store = new AvatarGenerationDraftStore(storage, localStorage);
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-08-09T22:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("restores an accepted design and every completed generation output", async () => {
        const design = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
        const frame = new Blob([new Uint8Array([4, 5, 6])], { type: "image/png" });
        const final = new Blob([new Uint8Array([7, 8, 9])], { type: "image/png" });
        const frames = Array.from<Blob | null>({ length: 12 }).fill(null);
        frames[2] = frame;
        frames[8] = frame;

        await store.save({
            description: "A fox botanist",
            style: "custom",
            customStyle: "Painted paper texture",
            designBlob: design,
            directionFrames: frames,
            finalBlob: final,
        });

        const restored = await store.load();
        expect(restored).not.toBeNull();
        if (restored === null || restored.finalBlob === null) throw new Error("Expected a complete restored draft");
        expect(restored).toMatchObject({
            description: "A fox botanist",
            style: "custom",
            customStyle: "Painted paper texture",
            updatedAt: "2026-08-09T22:00:00.000Z",
        });
        expect(new Uint8Array(await restored.designBlob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
        expect(restored.directionFrames.filter(Boolean)).toHaveLength(2);
        expect(new Uint8Array(await restored.finalBlob.arrayBuffer())).toEqual(new Uint8Array([7, 8, 9]));
    });

    it("migrates a valid partial localStorage checkpoint into blob storage", async () => {
        localStorage.setItem(
            "teapot-avatar-generation-draft-v1",
            JSON.stringify({
                version: 1,
                description: "Recovered avatar",
                style: "cartoon",
                customStyle: "",
                design: { mediaType: "image/png", base64: "AQID" },
                directionFrames: [
                    { mediaType: "image/png", base64: "BAUG" },
                    ...Array.from({ length: 11 }, () => null),
                ],
                final: null,
                updatedAt: "2026-08-09T21:00:00.000Z",
            }),
        );

        const restored = await store.load();

        expect(restored?.description).toBe("Recovered avatar");
        expect(restored?.directionFrames.filter(Boolean)).toHaveLength(1);
        expect(storage.get("active")).toMatchObject({ version: 2, description: "Recovered avatar" });
        expect(localStorage.getItem("teapot-avatar-generation-draft-v1")).toBeNull();
    });

    it("clears a completed draft", async () => {
        await store.save({
            description: "Avatar",
            style: "cartoon",
            customStyle: "",
            designBlob: new Blob([new Uint8Array([1])]),
            directionFrames: Array.from({ length: 12 }, () => null),
            finalBlob: null,
        });

        await store.clear();

        expect(await store.load()).toBeNull();
    });

    it("archives original-resolution source blobs under the accepted asset ID", async () => {
        const design = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
        const frame = new Blob([new Uint8Array([5, 6, 7, 8])], { type: "image/png" });
        await store.save({
            description: "High resolution avatar",
            style: "cartoon",
            customStyle: "",
            designBlob: design,
            directionFrames: [frame, ...Array.from({ length: 11 }, () => null)],
            finalBlob: new Blob([new Uint8Array([9])], { type: "image/png" }),
        });

        await store.archive("teapot-woka:avatar-1");

        expect(await store.load()).toBeNull();
        expect(storage.get("completed:teapot-woka:avatar-1")).toMatchObject({
            description: "High resolution avatar",
            designBlob: design,
            directionFrames: [frame, ...Array.from({ length: 11 }, () => null)],
        });
    });

    it("lists completed avatar sheets so the picker can restore them", async () => {
        await store.save({
            description: "Recovered wizard",
            style: "cartoon",
            customStyle: "",
            designBlob: new Blob([new Uint8Array([1])]),
            directionFrames: Array.from({ length: 12 }, () => null),
            finalBlob: new Blob([new Uint8Array([2])], { type: "image/png" }),
        });

        await store.archive("teapot-woka:recovered-wizard");

        const archived = await store.listArchived();
        expect(archived).toHaveLength(1);
        expect(archived[0]).toMatchObject({
            assetId: "teapot-woka:recovered-wizard",
            description: "Recovered wizard",
        });
    });
});
