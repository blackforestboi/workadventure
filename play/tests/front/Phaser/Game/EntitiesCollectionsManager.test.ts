import { Direction, type EntityRawPrefab } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { describe, expect, it } from "vitest";
import { EntitiesCollectionsManager } from "../../../../src/front/Phaser/Game/MapEditor/EntitiesCollectionsManager";

const uploadedEntity = (name: string): EntityRawPrefab => ({
    id: "generated-tree-id",
    name,
    tags: ["Nature"],
    imagePath: "generated-tree.png",
    direction: Direction.Down,
    color: "",
});

describe("EntitiesCollectionsManager", () => {
    it("upserts a retried custom upload instead of exposing duplicate optimistic catalog entries", async () => {
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([]);
        await manager.getEntityPrefab("custom entities", "missing");

        manager.addUploadedEntity(uploadedEntity("Old tree"), "https://maps.example.test/entities/");
        manager.addUploadedEntity(uploadedEntity("Generated tree"), "https://maps.example.test/entities/");

        const variants = get(manager.getEntitiesPrefabsVariantStore());
        expect(variants).toHaveLength(1);
        expect(variants[0]?.defaultPrefab.name).toBe("Generated tree");
        await expect(manager.getEntityPrefab("custom entities", "generated-tree-id")).resolves.toEqual(
            expect.objectContaining({ name: "Generated tree" }),
        );
    });
});
