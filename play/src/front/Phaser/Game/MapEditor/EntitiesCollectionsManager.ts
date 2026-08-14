import type {
    EntityCollection,
    EntityCollectionRaw,
    EntityPrefab,
    EntityPrefabType,
    EntityRawPrefab,
    VegetationProfile,
    WallProfile,
} from "@workadventure/map-editor";
import {
    createWallFoundationCollisionGrid,
    WALL_DEFAULT_HEIGHT_TILES,
    WALL_DEFAULT_WIDTH_TILES,
} from "@workadventure/map-editor";
import type { Readable, Writable } from "svelte/store";
import { derived, writable } from "svelte/store";
import { entitiesFileMigration } from "@workadventure/map-editor/src/Migrations/EntitiesFileMigration";
import { asError } from "catch-unknown";
import { EntityVariant } from "./Entities/EntityVariant";

export class EntitiesCollectionsManager {
    private entitiesPrefabsMapPromise!: Promise<Map<string, EntityPrefab>>;
    private tags: string[] = [];

    private currentCollection: EntityCollection = { collectionName: "All Object Collection", collection: [], tags: [] };
    private readonly entitiesPrefabsStore: Writable<EntityPrefab[]>;
    private readonly entitiesPrefabsVariantStore: Readable<EntityVariant[]>;

    constructor() {
        this.entitiesPrefabsStore = writable([]);
        this.entitiesPrefabsVariantStore = derived(this.entitiesPrefabsStore, ($entitiesPrefabsStore) => {
            // entityVariants ordered by collectionName+name
            const entityVariants = new Map<string, EntityVariant>();
            for (const entityPrefab of $entitiesPrefabsStore) {
                const idOrGeneratedName =
                    entityPrefab.type === "Custom"
                        ? entityPrefab.id
                        : entityPrefab.collectionName + "__" + entityPrefab.name;
                let variant = entityVariants.get(idOrGeneratedName);
                if (variant === undefined) {
                    variant = new EntityVariant(entityPrefab);
                    entityVariants.set(idOrGeneratedName, variant);
                } else {
                    variant.addPrefab(entityPrefab);
                }
            }
            return [...entityVariants.values()];
        });
    }

    public getEntitiesPrefabsVariantStore(): Readable<EntityVariant[]> {
        return this.entitiesPrefabsVariantStore;
    }

    public getEntitiesPrefabsStore(): Readable<EntityPrefab[]> {
        return this.entitiesPrefabsStore;
    }

    public async getEntityPrefab(collectionName: string, entityPrefabId: string): Promise<EntityPrefab | undefined> {
        const prefabsMap = await this.entitiesPrefabsMapPromise;
        return prefabsMap.get(entityPrefabId);
    }

    public loadCollections(collectionDescriptors: { url: string; type: EntityPrefabType }[]): void {
        this.entitiesPrefabsMapPromise = new Promise<Map<string, EntityPrefab>>((resolve, reject) => {
            const entityCollections: { collection: EntityCollection; url: string }[] = [];
            const fetchUrlPromises: Promise<EntityCollectionRaw>[] = [];
            for (const descriptor of collectionDescriptors) {
                const promise = this.fetchRawCollection(descriptor.url);
                fetchUrlPromises.push(promise);
            }

            //TODO check tagSet and this.currentCollection
            Promise.allSettled(fetchUrlPromises)
                .then((promises) => {
                    for (let i = 0; i < promises.length; i++) {
                        const promise = promises[i];
                        const descriptor = collectionDescriptors[i];
                        if (promise.status === "fulfilled") {
                            let entityCollectionRaw = promise.value;
                            try {
                                entityCollectionRaw = entitiesFileMigration.migrate(entityCollectionRaw);
                                entityCollections.push({
                                    collection: this.parseRawCollection(entityCollectionRaw, descriptor.type),
                                    url: descriptor.url,
                                });
                            } catch (error) {
                                console.error("Error while parsing entity collection", descriptor.url, error);
                            }
                        } else {
                            console.error("Error while loading entity collection", descriptor.url, promise.reason);
                        }
                    }

                    for (const { collection, url } of entityCollections) {
                        const tagSet = new Set<string>();
                        collection.collection.forEach((entity: EntityPrefab) => {
                            this.currentCollection.collection.push({
                                name: entity.name,
                                id: entity.id,
                                collectionName: entity.collectionName,
                                depthOffset: entity.depthOffset ?? 0,
                                tags: [...entity.tags, ...collection.tags],
                                imagePath: new URL(entity.imagePath, url).toString(),
                                direction: entity.direction,
                                color: entity.color,
                                collisionGrid: entity.collisionGrid,
                                animation: entity.animation,
                                defaultSizeInTiles: entity.defaultSizeInTiles,
                                defaultHeightInTiles: entity.defaultHeightInTiles,
                                previewPadding: entity.previewPadding,
                                previewOffsetX: entity.previewOffsetX,
                                previewOffsetY: entity.previewOffsetY,
                                vegetation: entity.vegetation,
                                wall: entity.wall,
                                type: entity.type,
                            });
                            entity.tags.forEach((tag: string) => tagSet.add(tag));
                        });

                        const tags = [...new Set([...tagSet, ...this.tags])];
                        tags.sort();
                        this.tags = tags;
                    }
                    this.entitiesPrefabsStore.set(this.currentCollection.collection);

                    const prefabsMap = new Map<string, EntityPrefab>();
                    for (const prefab of this.currentCollection.collection) {
                        prefabsMap.set(prefab.id, prefab);
                    }
                    resolve(prefabsMap);
                })
                .catch((error) => {
                    console.error(error);
                    reject(error instanceof Error ? error : new Error(JSON.stringify(error)));
                });
        });
    }

    public addUploadedEntity(uploadedEntity: EntityRawPrefab, customEntityCollectionUrl: string) {
        const uploadedEntityPrefab: EntityPrefab = {
            ...this.parseRawEntityPrefab("custom entities", uploadedEntity, "Custom"),
            imagePath: new URL(uploadedEntity.imagePath, customEntityCollectionUrl).toString(),
        };
        const currentCollectionIndex = this.currentCollection.collection.findIndex(
            (entityPrefab) => entityPrefab.id === uploadedEntityPrefab.id,
        );
        if (currentCollectionIndex === -1) {
            this.currentCollection.collection.push(uploadedEntityPrefab);
        } else {
            this.currentCollection.collection[currentCollectionIndex] = uploadedEntityPrefab;
        }

        this.entitiesPrefabsStore.update((currentEntitiesPrefabs) => {
            const existingEntityIndex = currentEntitiesPrefabs.findIndex(
                (entityPrefab) => entityPrefab.id === uploadedEntityPrefab.id,
            );
            if (existingEntityIndex === -1) {
                return [...currentEntitiesPrefabs, uploadedEntityPrefab];
            }
            return currentEntitiesPrefabs.map((entityPrefab, index) =>
                index === existingEntityIndex ? uploadedEntityPrefab : entityPrefab,
            );
        });
        this.entitiesPrefabsMapPromise = new Promise<Map<string, EntityPrefab>>((resolve, reject) => {
            this.entitiesPrefabsMapPromise
                .then((existingEntitiesPrefabsMap) => {
                    existingEntitiesPrefabsMap.set(uploadedEntityPrefab.id, uploadedEntityPrefab);
                    resolve(existingEntitiesPrefabsMap);
                })
                .catch((error) => {
                    console.error(error);
                    reject(asError(error));
                });
        });
    }

    public modifyCustomEntity(
        id: string,
        name: string,
        tags: string[],
        depthOffset?: number,
        collisionGrid?: number[][],
        defaultSizeInTiles?: number,
        defaultHeightInTiles?: number,
        animation?: EntityPrefab["animation"],
        previewPadding?: number,
        previewOffsetX?: number,
        previewOffsetY?: number,
        vegetation?: VegetationProfile,
        wall?: WallProfile,
    ): void {
        const updatePrefab = (entity: EntityPrefab): EntityPrefab =>
            this.withWallCollisionDefault({
                ...entity,
                name,
                tags,
                depthOffset,
                collisionGrid,
                defaultSizeInTiles: defaultSizeInTiles ?? entity.defaultSizeInTiles,
                defaultHeightInTiles: defaultHeightInTiles ?? entity.defaultHeightInTiles,
                animation: animation ?? entity.animation,
                previewPadding: previewPadding ?? entity.previewPadding,
                previewOffsetX: previewOffsetX ?? entity.previewOffsetX,
                previewOffsetY: previewOffsetY ?? entity.previewOffsetY,
                vegetation: vegetation ?? entity.vegetation,
                wall: wall ?? entity.wall,
            });
        this.currentCollection.collection = this.currentCollection.collection.map((entity) =>
            entity.id === id ? updatePrefab(entity) : entity,
        );
        this.entitiesPrefabsStore.update((currentEntitiesPrefabs) => {
            return currentEntitiesPrefabs.map((entity) => (entity.id === id ? updatePrefab(entity) : entity));
        });
        this.entitiesPrefabsMapPromise = new Promise<Map<string, EntityPrefab>>((resolve, reject) => {
            this.entitiesPrefabsMapPromise
                .then((existingEntitiesPrefabsMap) => {
                    const entity = existingEntitiesPrefabsMap.get(id);
                    if (entity) {
                        existingEntitiesPrefabsMap.set(id, updatePrefab(entity));
                    }
                    resolve(existingEntitiesPrefabsMap);
                })
                .catch((error) => {
                    console.error(error);
                    reject(asError(error));
                });
        });
    }

    public deleteCustomEntity(id: string): void {
        this.entitiesPrefabsStore.update((currentEntitiesPrefabs) => {
            return currentEntitiesPrefabs.filter((entityPrefab) => entityPrefab.id !== id);
        });
        this.entitiesPrefabsMapPromise = new Promise<Map<string, EntityPrefab>>((resolve, reject) => {
            this.entitiesPrefabsMapPromise
                .then((existingEntitiesPrefabsMap) => {
                    existingEntitiesPrefabsMap.delete(id);
                    resolve(existingEntitiesPrefabsMap);
                })
                .catch((error) => {
                    console.error(error);
                    reject(asError(error));
                });
        });
    }

    private async fetchRawCollection(url: string): Promise<EntityCollectionRaw> {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
        }
        return response.json();
    }

    private parseRawCollection(
        rawCollection: EntityCollectionRaw,
        rawCollectionType: EntityPrefabType,
    ): EntityCollection {
        return {
            collectionName: rawCollection.collectionName,
            tags: [...rawCollection.tags],
            collection: rawCollection.collection.map((rawPrefab: EntityRawPrefab) =>
                this.parseRawEntityPrefab(rawCollection.collectionName, rawPrefab, rawCollectionType),
            ),
        };
    }

    private parseRawEntityPrefab(
        collectionName: string,
        rawPrefab: EntityRawPrefab,
        entityPrefabType: EntityPrefabType,
    ): EntityPrefab {
        return this.withWallCollisionDefault({
            ...rawPrefab,
            collectionName,
            type: entityPrefabType,
        });
    }

    private withWallCollisionDefault(entity: EntityPrefab): EntityPrefab {
        if (entity.wall === undefined) return entity;
        const defaultSizeInTiles = entity.defaultSizeInTiles ?? WALL_DEFAULT_WIDTH_TILES;
        const defaultHeightInTiles = entity.defaultHeightInTiles ?? WALL_DEFAULT_HEIGHT_TILES;
        return {
            ...entity,
            defaultSizeInTiles,
            defaultHeightInTiles,
            collisionGrid:
                entity.collisionGrid ?? createWallFoundationCollisionGrid(defaultSizeInTiles, defaultHeightInTiles),
        };
    }
}
