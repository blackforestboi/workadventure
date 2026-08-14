import path from "path";
import {
    CollisionGrid,
    ENTITIES_FOLDER_PATH,
    ENTITY_COLLECTION_FILE,
    EntityCollectionRaw,
    EntityRawPrefab,
    VegetationProfile,
    VisualAssetAnimation,
    WallProfile,
    WALL_DEFAULT_HEIGHT_TILES,
    WALL_DEFAULT_WIDTH_TILES,
    createWallFoundationCollisionGrid,
    entityUploadSupportedFormatForMapStorage,
    mapCustomEntityDirectionToDirection,
} from "@workadventure/map-editor";
import type {
    DeleteCustomEntityMessage,
    ModifyCustomEntityMessage,
    UploadEntityMessage,
} from "@workadventure/messages";
import { fileSystem } from "../fileSystem";
import { mapPathUsingDomainWithPrefix } from "./PathMapper";

export class CustomEntityCollectionService {
    private static readonly collectionLocks = new Map<string, Promise<void>>();

    private readonly hostname: string;

    constructor(hostname: string) {
        this.hostname = hostname;
    }

    private getEntityCollectionFileVirtualPath() {
        return mapPathUsingDomainWithPrefix(`${ENTITIES_FOLDER_PATH}/${ENTITY_COLLECTION_FILE}`, this.hostname);
    }

    private getEntityToUploadVirtualPath(fileName: string) {
        const { base: filenameWithoutPotentialPath, ext: fileExtension } = path.parse(fileName);

        if (fileExtension.match(entityUploadSupportedFormatForMapStorage) === null) {
            throw new Error("File extension is not a supported image");
        }
        return mapPathUsingDomainWithPrefix(`${ENTITIES_FOLDER_PATH}/${filenameWithoutPotentialPath}`, this.hostname);
    }

    public async uploadEntity(uploadEntityMessage: UploadEntityMessage) {
        const { imagePath, file } = uploadEntityMessage;
        if (file.byteLength === 0) {
            throw new Error("Cannot upload an empty custom entity image");
        }
        const entity = this.withWallCollisionDefault(
            this.mapEntityFromUploadEntityMessageToEntityRawPrefab(uploadEntityMessage),
        );
        await this.withEntityCollectionLock(async () => {
            // Keep the binary and its catalog entry ordered against modify/delete/retry
            // operations for this map. A retry upserts the same stable entity ID.
            await fileSystem.writeByteArrayAsFile(this.getEntityToUploadVirtualPath(imagePath), file);
            const customEntityCollectionFileContent = await this.readOrCreateEntitiesCollectionFile();
            const customEntityCollection = EntityCollectionRaw.parse(JSON.parse(customEntityCollectionFileContent));
            const existingEntityIndex = customEntityCollection.collection.findIndex(
                (candidate) => candidate.id === entity.id,
            );
            if (existingEntityIndex === -1) {
                customEntityCollection.collection.push(entity);
            } else {
                customEntityCollection.collection[existingEntityIndex] = entity;
            }
            await fileSystem.writeStringAsFile(
                this.getEntityCollectionFileVirtualPath(),
                JSON.stringify(customEntityCollection),
            );
        });
    }

    public async modifyEntity(modifyCustomEntityMessage: ModifyCustomEntityMessage) {
        const {
            id,
            name,
            tags,
            depthOffset,
            defaultSizeInTiles,
            defaultHeightInTiles,
            previewPadding,
            previewOffsetX,
            previewOffsetY,
        } = modifyCustomEntityMessage;
        let collisionGrid = undefined;
        if (modifyCustomEntityMessage.collisionGrid) {
            collisionGrid = CollisionGrid.parse(modifyCustomEntityMessage.collisionGrid);
        }
        const parsedAnimation = VisualAssetAnimation.optional().parse(modifyCustomEntityMessage.animation);
        const parsedVegetation = VegetationProfile.optional().parse(modifyCustomEntityMessage.vegetation);
        const parsedWall = WallProfile.optional().parse(modifyCustomEntityMessage.wall);
        await this.withEntityCollectionLock(async () => {
            const customEntityCollectionFileContent = await this.readOrCreateEntitiesCollectionFile();
            const customEntityCollection = EntityCollectionRaw.parse(JSON.parse(customEntityCollectionFileContent));
            const indexOfEntityToModify = customEntityCollection.collection.findIndex((entity) => entity.id === id);
            if (indexOfEntityToModify !== -1) {
                const entityToModify = customEntityCollection.collection[indexOfEntityToModify];
                customEntityCollection.collection[indexOfEntityToModify] = this.withWallCollisionDefault({
                    ...entityToModify,
                    name,
                    tags,
                    depthOffset,
                    collisionGrid,
                    animation: parsedAnimation ?? entityToModify.animation,
                    defaultSizeInTiles: defaultSizeInTiles ?? entityToModify.defaultSizeInTiles,
                    defaultHeightInTiles: defaultHeightInTiles ?? entityToModify.defaultHeightInTiles,
                    previewPadding: previewPadding ?? entityToModify.previewPadding,
                    previewOffsetX: previewOffsetX ?? entityToModify.previewOffsetX,
                    previewOffsetY: previewOffsetY ?? entityToModify.previewOffsetY,
                    vegetation: parsedVegetation ?? entityToModify.vegetation,
                    wall: parsedWall ?? entityToModify.wall,
                });
                await fileSystem.writeStringAsFile(
                    this.getEntityCollectionFileVirtualPath(),
                    JSON.stringify(customEntityCollection),
                );
            } else {
                console.error(
                    `[${new Date().toISOString()}] Unable to find the entity to modify in custom entities file`,
                );
            }
        });
    }

    public async deleteEntity(deleteCustomEntityMessage: DeleteCustomEntityMessage) {
        const { id } = deleteCustomEntityMessage;
        await this.withEntityCollectionLock(async () => {
            const customEntityCollectionFileContent = await this.readOrCreateEntitiesCollectionFile();
            const customEntityCollection = EntityCollectionRaw.parse(JSON.parse(customEntityCollectionFileContent));
            const customEntityToDelete = customEntityCollection.collection.find((entity) => entity.id === id);
            customEntityCollection.collection = customEntityCollection.collection.filter(
                (customEntity) => customEntity.id !== id,
            );
            await fileSystem.writeStringAsFile(
                this.getEntityCollectionFileVirtualPath(),
                JSON.stringify(customEntityCollection),
            );
            if (customEntityToDelete) {
                await fileSystem.deleteFiles(this.getEntityToUploadVirtualPath(customEntityToDelete.imagePath));
            }
        });
    }

    private async readOrCreateEntitiesCollectionFile() {
        const entityCollectionFileVirtualPath = this.getEntityCollectionFileVirtualPath();
        const fileExist = await fileSystem.exist(entityCollectionFileVirtualPath);
        if (!fileExist) {
            const entityCollectionFile: EntityCollectionRaw = {
                version: "1.0",
                collection: [],
                collectionName: "custom entities",
                tags: [],
            };
            await fileSystem.writeStringAsFile(entityCollectionFileVirtualPath, JSON.stringify(entityCollectionFile));
        }
        //Check current version and migrate to new one
        return fileSystem.readFileAsString(entityCollectionFileVirtualPath);
    }

    private mapEntityFromUploadEntityMessageToEntityRawPrefab(
        uploadEntityMessage: UploadEntityMessage,
    ): EntityRawPrefab {
        return EntityRawPrefab.parse({
            ...uploadEntityMessage,
            direction: mapCustomEntityDirectionToDirection(uploadEntityMessage.direction),
        });
    }

    private withWallCollisionDefault(entity: EntityRawPrefab): EntityRawPrefab {
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

    private async withEntityCollectionLock(operation: () => Promise<void>): Promise<void> {
        const collectionPath = this.getEntityCollectionFileVirtualPath();
        const previousOperation =
            CustomEntityCollectionService.collectionLocks.get(collectionPath) ?? Promise.resolve();
        const currentOperation = previousOperation.catch(() => undefined).then(operation);
        CustomEntityCollectionService.collectionLocks.set(collectionPath, currentOperation);
        try {
            await currentOperation;
        } finally {
            if (CustomEntityCollectionService.collectionLocks.get(collectionPath) === currentOperation) {
                CustomEntityCollectionService.collectionLocks.delete(collectionPath);
            }
        }
    }
}
