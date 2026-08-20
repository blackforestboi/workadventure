import { describe, expect, it, vi } from "vitest";

import { MapStyleController } from "../../../src/front/Services/MapStyleController";
import { MapStyleLocalStore } from "../../../src/front/Services/MapStyleLocalStore";

const style = {
    id: "default",
    name: "Default",
    isDefault: true,
    isBuiltIn: true,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
};

describe("MapStyleController", () => {
    it("publishes cache first, reconciles stable server IDs, and preserves a failed name", async () => {
        const store = new MapStyleLocalStore(undefined, () => new Date("2026-08-20T00:00:00.000Z"));
        await store.write("user:a", { styles: [style], activeStyleId: style.id });
        const api = {
            list: vi.fn().mockResolvedValue({ styles: [style], entries: [] }),
            create: vi.fn().mockRejectedValue(new Error("conflict")),
            copy: vi.fn(),
        };
        const snapshots: unknown[] = [];
        const controller = new MapStyleController(
            "user:a",
            true,
            store,
            api,
            (snapshot) => snapshots.push(snapshot),
            () => "mutation-1",
        );
        await controller.hydrate("map-entity");
        await expect(controller.create("Watercolor")).rejects.toThrow("conflict");
        expect(snapshots.at(-1)).toMatchObject({
            draftName: "Watercolor",
            warning: "conflict",
            activeStyleId: "default",
        });
    });
});
