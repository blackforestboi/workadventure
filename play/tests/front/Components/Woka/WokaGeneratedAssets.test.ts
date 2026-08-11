import { describe, expect, it } from "vitest";

import {
    addGeneratedWokaAsset,
    findWokaTextureCollectionIndex,
    generatedWokaName,
    removeGeneratedWokaAsset,
} from "../../../../src/front/Components/Woka/WokaGeneratedAssets";
import type { WokaData } from "../../../../src/front/Components/Woka/WokaTypes";

const emptyData = (): WokaData => ({
    woka: { collections: [] },
    body: { collections: [] },
    eyes: { collections: [] },
    hair: { collections: [] },
    clothes: { collections: [] },
    hat: { collections: [] },
    accessory: { collections: [] },
});

describe("generated Woka collections", () => {
    it("adds and removes a generated part without mutating other layers", () => {
        const original = emptyData();
        const asset = {
            id: "teapot-woka:hat-1",
            name: "Moss hat",
            url: "/teapot/woka-assets/hat-1.png",
            category: "hat" as const,
            active: true,
            createdAt: "2026-08-09T12:00:00.000Z",
        };

        const added = addGeneratedWokaAsset(original, asset);
        expect(findWokaTextureCollectionIndex(added, "hat", asset.id)).toBe(0);
        expect(added.hat.collections[0].textures[0]).toMatchObject({ id: asset.id, url: asset.url });
        expect(original.hat.collections).toEqual([]);
        expect(removeGeneratedWokaAsset(added, asset).hat.collections).toEqual([]);
    });

    it("creates a bounded display name from the prompt", () => {
        const name = generatedWokaName("accessory", `  a   very ${"long ".repeat(30)}lantern  `);
        expect(name.startsWith("Accessory: a very long")).toBe(true);
        expect(name.length).toBe(80);
    });
});
