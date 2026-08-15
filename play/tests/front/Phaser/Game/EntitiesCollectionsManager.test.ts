import { Direction, type EntityRawPrefab } from "@workadventure/map-editor";
import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    afterEach(() => vi.unstubAllGlobals());

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

    it("keeps saved grid settings in the custom catalog", async () => {
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([]);
        await manager.getEntityPrefab("custom entities", "missing");

        manager.addUploadedEntity(
            {
                ...uploadedEntity("Pool table"),
                defaultSizeInTiles: 1,
                defaultHeightInTiles: 1,
                previewPadding: 24,
            },
            "https://maps.example.test/entities/",
        );
        manager.modifyCustomEntity("generated-tree-id", "Pool table", ["Nature"], 0, [[1, 0]], 2, 3, undefined, -12);

        const prefab = get(manager.getEntitiesPrefabsVariantStore())[0]?.defaultPrefab;
        expect(prefab).toMatchObject({
            collisionGrid: [[1, 0]],
            defaultSizeInTiles: 2,
            defaultHeightInTiles: 3,
            previewPadding: -12,
        });
    });

    it("gives every wall entering the client catalog a blocking lower tile", async () => {
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([]);
        await manager.getEntityPrefab("custom entities", "missing");

        manager.addUploadedEntity(
            {
                ...uploadedEntity("Stone wall"),
                wall: { version: 1, style: "Stone", projectionDepthTiles: 0.5 },
            },
            "https://maps.example.test/entities/",
        );

        const prefab = get(manager.getEntitiesPrefabsVariantStore())[0]?.defaultPrefab;
        expect(prefab).toMatchObject({
            defaultSizeInTiles: 2,
            defaultHeightInTiles: 2,
            collisionGrid: [
                [0, 0],
                [1, 1],
            ],
        });
    });

    it("applies a collection-level rendered-size contract to every prefab", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            version: "1.0.0",
                            collectionName: "Sized collection",
                            tags: [],
                            defaultDimensionsControlDisplay: true,
                            collection: [uploadedEntity("Sized tree")],
                        }),
                }),
            ),
        );
        const manager = new EntitiesCollectionsManager();
        manager.loadCollections([{ url: "https://example.test/collection.json", type: "Default" }]);

        await expect(manager.getEntityPrefab("Sized collection", "generated-tree-id")).resolves.toMatchObject({
            defaultDimensionsControlDisplay: true,
        });
    });
});
