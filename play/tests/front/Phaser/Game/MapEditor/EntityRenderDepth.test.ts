import { describe, expect, it } from "vitest";
import type { EntityPrefab } from "@workadventure/map-editor";
import { getEntityRenderDepth } from "../../../../../src/front/Phaser/Game/MapEditor/Entities/EntityRenderDepth";

const prefab = (overrides: Partial<EntityPrefab> = {}): EntityPrefab =>
    ({ id: "test", name: "Test", imagePath: "test.png", tags: [], ...overrides }) as EntityPrefab;

describe("getEntityRenderDepth", () => {
    it("sorts ordinary entities at the bottom of their image", () => {
        expect(getEntityRenderDepth(100, 64, prefab())).toBe(164);
    });

    it("sorts trees against avatar feet so the avatar can walk behind the canopy", () => {
        const tree = prefab({ vegetation: { version: 1, category: "tree" } });

        expect(getEntityRenderDepth(100, 64, tree)).toBe(180);
    });

    it("does not give other vegetation the tree occlusion offset", () => {
        const bush = prefab({ vegetation: { version: 1, category: "bush" } });

        expect(getEntityRenderDepth(100, 64, bush)).toBe(164);
    });

    it("preserves authored and elevation offsets", () => {
        const tree = prefab({ depthOffset: 5, vegetation: { version: 1, category: "tree" } });

        expect(getEntityRenderDepth(100, 64, tree, 20)).toBe(165);
    });
});
