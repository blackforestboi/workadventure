import type { EntityPrefab } from "@workadventure/map-editor";
import type { EntityVariant } from "../../../Phaser/Game/MapEditor/Entities/EntityVariant";
import type { MapEditorStyleAssetMetadata, MapEditorStyleSource } from "../../../Stores/MapEditorStyleStore";

export interface ObjectStyleSnapshot {
    prefabs: EntityPrefab[];
}

export function getObjectStyleSource(entityVariant: EntityVariant): MapEditorStyleSource {
    return { type: "entity-prefab", key: entityVariant.id, version: "entity-prefab-v1" };
}

export function getObjectStyleMetadata(entityVariant: EntityVariant): MapEditorStyleAssetMetadata<ObjectStyleSnapshot> {
    const prefabs = entityVariant.colors.flatMap((color) => entityVariant.getEntityPrefabsPositions(color));
    return {
        name: entityVariant.defaultPrefab.name,
        tags: [...new Set(prefabs.flatMap((prefab) => prefab.tags))],
        keywords: [...new Set(prefabs.flatMap((prefab) => [prefab.name, prefab.collectionName]))],
        category: entityVariant.defaultPrefab.collectionName,
        previewUrl: entityVariant.defaultPrefab.imagePath,
        snapshot: { prefabs },
    };
}
