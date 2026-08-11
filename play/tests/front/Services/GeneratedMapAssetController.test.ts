import { describe, expect, it, vi } from "vitest";

import {
    GeneratedMapAssetController,
    generatedAssetDisplayName,
    generatedAssetOwnerScope,
    mergeGeneratedMapAssets,
} from "../../../src/front/Services/GeneratedMapAssetController";
import type {
    GeneratedAssetLocalRecord,
    GeneratedAssetLocalUpsert,
} from "../../../src/front/Services/GeneratedAssetLocalStore";
import type { TeapotGeneratedAssetView } from "../../../src/front/Services/TeapotGeneratedAssetApi";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function png(bytes = [137, 80, 78, 71]): Blob {
    return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

function localRecord(patch: Partial<GeneratedAssetLocalRecord> = {}): GeneratedAssetLocalRecord {
    return {
        clientId: "client-1",
        ownerScope: "user:user-1",
        name: "Local name",
        png: png(),
        sha256: SHA_A,
        provenance: { providerId: "openrouter", modelId: "image-model" },
        syncStatus: "synced",
        createdAt: "2026-08-12T09:00:00.000Z",
        updatedAt: "2026-08-12T09:00:00.000Z",
        ...patch,
    };
}

function remoteAsset(patch: Partial<TeapotGeneratedAssetView> = {}): TeapotGeneratedAssetView {
    return {
        id: "server-1",
        name: "Remote name",
        url: "/teapot/generated-assets/server-1.png",
        kind: "map-entity",
        width: 512,
        height: 512,
        sha256: SHA_A,
        createdAt: "2026-08-12T09:00:00.000Z",
        ...patch,
    };
}

class MemoryLocalStore {
    public records: GeneratedAssetLocalRecord[];
    public failWrites = false;

    public constructor(records: GeneratedAssetLocalRecord[] = []) {
        this.records = records;
    }

    public async list(ownerScope: string): Promise<GeneratedAssetLocalRecord[]> {
        return this.records.filter((record) => record.ownerScope === ownerScope);
    }

    public async upsert(ownerScope: string, patch: GeneratedAssetLocalUpsert): Promise<GeneratedAssetLocalRecord> {
        if (this.failWrites) throw new Error("IndexedDB write failed");
        const existing = this.records.find(
            (record) => record.ownerScope === ownerScope && record.clientId === patch.clientId,
        );
        const now = "2026-08-12T10:00:00.000Z";
        const record = {
            ...existing,
            ...patch,
            ownerScope,
            clientId: patch.clientId,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
        } as GeneratedAssetLocalRecord;
        this.records = [record, ...this.records.filter((item) => item !== existing)];
        return record;
    }
}

type ApiMethodMock = ReturnType<typeof vi.fn>;

function remoteApi(overrides: Partial<Record<"list" | "upload" | "download", ApiMethodMock>> = {}) {
    return {
        list: overrides.list ?? vi.fn().mockResolvedValue([]),
        upload: overrides.upload ?? vi.fn().mockResolvedValue(remoteAsset()),
        download: overrides.download ?? vi.fn().mockResolvedValue(png()),
    };
}

describe("GeneratedMapAssetController", () => {
    it("uses an account scope only when both token and non-empty UUID exist", () => {
        expect(generatedAssetOwnerScope("token", " user-1 ")).toBe("user:user-1");
        expect(generatedAssetOwnerScope(null, "user-1")).toBe("anonymous");
        expect(generatedAssetOwnerScope("token", "  ")).toBe("anonymous");
    });

    it("saves a generated PNG locally before resolving and starts the authenticated upload afterward", async () => {
        const store = new MemoryLocalStore();
        let resolveUpload!: (asset: TeapotGeneratedAssetView) => void;
        const upload = vi.fn().mockImplementation(
            () => new Promise<TeapotGeneratedAssetView>((resolve) => (resolveUpload = resolve)),
        );
        const api = remoteApi({ upload });
        const snapshots: ReturnType<typeof mergeGeneratedMapAssets>[] = [];
        const controller = new GeneratedMapAssetController(
            "user:user-1",
            true,
            store,
            api,
            ({ items }) => snapshots.push(items),
        );

        const saved = await controller.saveGenerated({
            blob: png([1, 2, 3]),
            providerId: "openrouter",
            modelId: "image-model",
            prompt: "  A mossy shrine  ",
        });

        expect(saved.blob).toBeInstanceOf(Blob);
        expect(store.records[0]).toMatchObject({
            ownerScope: "user:user-1",
            name: "A mossy shrine",
            provenance: { providerId: "openrouter", modelId: "image-model" },
            syncStatus: "pending",
        });
        expect(store.records[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(store.records[0])).not.toContain("A mossy shrine  ");
        expect(upload).toHaveBeenCalledWith(
            expect.any(Blob),
            "A mossy shrine",
            "map-entity",
            { source: "generated", providerId: "openrouter", modelId: "image-model" },
            undefined,
        );
        expect(snapshots.at(-1)?.[0]?.blob).toBeInstanceOf(Blob);
        resolveUpload(remoteAsset());
        await vi.waitFor(() => expect(store.records[0]?.syncStatus).toBe("synced"));
    });

    it("rejects acceptance when the required local write fails and never uploads", async () => {
        const store = new MemoryLocalStore();
        store.failWrites = true;
        const api = remoteApi();
        const controller = new GeneratedMapAssetController("user:user-1", true, store, api, () => undefined);

        await expect(
            controller.saveGenerated({
                blob: png(),
                providerId: "openrouter",
                modelId: "image-model",
                prompt: "Shrine",
            }),
        ).rejects.toThrow("IndexedDB write failed");
        expect(api.upload).not.toHaveBeenCalled();
    });

    it("shows scoped local cards before a slow remote list and retries failed account uploads", async () => {
        const failed = localRecord({ syncStatus: "failed", syncError: "offline" });
        const store = new MemoryLocalStore([failed]);
        let resolveList!: (assets: TeapotGeneratedAssetView[]) => void;
        const list = vi.fn().mockImplementation(
            () => new Promise<TeapotGeneratedAssetView[]>((resolve) => (resolveList = resolve)),
        );
        const api = remoteApi({ list });
        const snapshots: string[][] = [];
        const controller = new GeneratedMapAssetController(
            "user:user-1",
            true,
            store,
            api,
            ({ items }) => snapshots.push(items.map((item) => item.name)),
        );

        const hydration = controller.hydrate();
        await vi.waitFor(() => expect(snapshots[0]).toEqual(["Local name"]));
        expect(api.upload).toHaveBeenCalledTimes(1);
        expect(list).toHaveBeenCalledTimes(1);
        resolveList([remoteAsset()]);
        await hydration;
        expect(snapshots.at(-1)).toEqual(["Remote name"]);
        expect(store.records[0]?.syncStatus).toBe("synced");
    });

    it("merges by server ID before fingerprint, preferring remote metadata and the cached Blob", () => {
        const cached = localRecord({ sha256: SHA_B, serverAsset: remoteAsset({ sha256: SHA_B }) });
        const duplicateFingerprint = localRecord({ clientId: "client-2", sha256: SHA_A });

        const merged = mergeGeneratedMapAssets([cached, duplicateFingerprint], [remoteAsset()]);

        expect(merged).toHaveLength(1);
        expect(merged[0]).toMatchObject({ name: "Remote name", local: cached, remote: { id: "server-1" } });
        expect(merged[0]?.blob).toBe(cached.png);
    });

    it("keeps scoped local cards enabled and reports a warning when the remote list fails", async () => {
        const store = new MemoryLocalStore([localRecord()]);
        const api = remoteApi({ list: vi.fn().mockRejectedValue(new Error("service unavailable")) });
        const snapshots: { names: string[]; warning?: string }[] = [];
        const controller = new GeneratedMapAssetController(
            "user:user-1",
            true,
            store,
            api,
            ({ items, warning }) => snapshots.push({ names: items.map((item) => item.name), warning }),
        );

        await controller.hydrate();

        expect(snapshots.at(-1)).toEqual({ names: ["Local name"], warning: "service unavailable" });
    });

    it("keeps a remote-only card after a download failure so opening can be retried", async () => {
        const store = new MemoryLocalStore();
        const api = remoteApi({ download: vi.fn().mockRejectedValue(new Error("network unavailable")) });
        const snapshots: string[][] = [];
        const controller = new GeneratedMapAssetController(
            "user:user-1",
            true,
            store,
            api,
            ({ items }) => snapshots.push(items.map((item) => item.key)),
        );
        const card = mergeGeneratedMapAssets([], [remoteAsset()])[0]!;

        await expect(controller.open(card)).rejects.toThrow("network unavailable");
        expect(card.remote?.id).toBe("server-1");
        expect(store.records).toEqual([]);
        expect(snapshots).toEqual([]);
    });

    it("stores only a bounded display name derived from a prompt", () => {
        expect(generatedAssetDisplayName("  line one\n line two  ")).toBe("line one line two");
        expect(generatedAssetDisplayName("x".repeat(200))).toHaveLength(80);
    });
});
