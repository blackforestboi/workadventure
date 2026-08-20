import { describe, expect, it } from "vitest";

import { MapStyleLocalStore, type MapStyleKeyValueStorage } from "../../../src/front/Services/MapStyleLocalStore";

class MemoryStorage implements MapStyleKeyValueStorage {
    value: string | null = null;
    getItem(): string | null {
        return this.value;
    }
    setItem(_key: string, value: string): void {
        this.value = value;
    }
}

describe("MapStyleLocalStore", () => {
    it("keeps anonymous and authenticated style caches isolated", async () => {
        const storage = new MemoryStorage();
        const store = new MapStyleLocalStore(storage, () => new Date("2026-08-20T00:00:00.000Z"));
        await store.write("anonymous", { activeStyleId: "local-style" });
        await store.write("user:a", { activeStyleId: "account-style" });
        await expect(store.read("anonymous")).resolves.toMatchObject({ activeStyleId: "local-style" });
        await expect(store.read("user:a")).resolves.toMatchObject({ activeStyleId: "account-style" });
        await expect(store.read("user:b")).resolves.not.toHaveProperty("activeStyleId");
    });
});
