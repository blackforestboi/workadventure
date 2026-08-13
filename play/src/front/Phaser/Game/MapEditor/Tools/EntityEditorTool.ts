import * as Phaser from "phaser";
import {
    getWallDragOrientation,
    getWallDragTiles,
    snapWorldPointToWallTile,
    vegetationPlacementPlanFromMessage,
    vegetationPresetFromMessage,
    WallPlacement,
    type AreaData,
    type EntityData,
    type WallPlacementOrientation,
    type WallTile,
    type WAMEntityData,
} from "@workadventure/map-editor";
import * as Sentry from "@sentry/svelte";
import type { EditMapCommandMessage } from "@workadventure/messages";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import { v4 as uuidv4 } from "uuid";
import {
    mapEditorCopiedEntityDataPropertiesStore,
    mapEditorDeleteCustomEntityEventStore,
    mapEditorEntityFileDroppedStore,
    mapEditorEntityModeStore,
    mapEditorEntityUploadDraftStore,
    mapEditorModifyCustomEntityEventStore,
    mapEditorSelectedEntityStore,
    mapEditorSelectedToolStore,
} from "../../../../Stores/MapEditorStore";
import { TexturesHelper } from "../../../Helpers/TexturesHelper";
import { CopyEntityEventData, EntitiesManagerEvent } from "../../GameMap/EntitiesManager";
import { CreateEntityFrontCommand } from "../Commands/Entity/CreateEntityFrontCommand";
import {
    CreateVegetationBatchFrontCommand,
    DeleteVegetationBatchFrontCommand,
} from "../Commands/Entity/CreateVegetationBatchFrontCommand";
import {
    DeleteVegetationPresetFrontCommand,
    UpsertVegetationPresetFrontCommand,
} from "../Commands/Vegetation/VegetationPresetFrontCommand";
import { DeleteCustomEntityFrontCommand } from "../Commands/Entity/DeleteCustomEntityFrontCommand";
import { DeleteEntityFrontCommand } from "../Commands/Entity/DeleteEntityFrontCommand";
import { ModifyCustomEntityFrontCommand } from "../Commands/Entity/ModifyCustomEntityFrontCommand";
import { UpdateEntityFrontCommand } from "../Commands/Entity/UpdateEntityFrontCommand";
import { UploadEntityFrontCommand } from "../Commands/Entity/UploadEntityFrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { EditorToolName } from "../MapEditorModeManager";
import { AreaPreview } from "../../../Components/MapEditor/AreaPreview";
import { mapEditorActivated } from "../../../../Stores/MenuStore";
import { hasPointerDragged } from "../PanGesture";
import { getEntityCollisionRectangles, getScaledCollisionGridFrame } from "../Entities/EntityCollisionGrid";
import { applyWallTextureToPreview } from "../Entities/WallTextureProjector";
import { EntityRelatedEditorTool } from "./EntityRelatedEditorTool";

import Key = Phaser.Input.Keyboard.Key;
import Pointer = Phaser.Input.Pointer;
import GameObject = Phaser.GameObjects.GameObject;

const ENTITY_EDITOR_AREA_PREVIEW_DEPTH = -1;

export class EntityEditorTool extends EntityRelatedEditorTool {
    private handleUpdateEntity: (entityData: EntityData) => void;
    private handleCopyEntity: (data: CopyEntityEventData) => void;
    /**
     * Visual representations of map Areas objects
     */
    protected areaPreviews: AreaPreview[] = [];

    protected ctrlKey?: Key;
    protected shiftKey?: Key;
    protected pointerMoveEventHandler!: (pointer: Pointer, gameObjects: GameObject[]) => void;
    protected pointerDownEventHandler!: (pointer: Pointer, gameObjects: GameObject[]) => void;
    protected pointerUpEventHandler!: (pointer: Pointer) => void;
    private panCandidate = false;
    private panning = false;
    private wallDragStart: WallTile | undefined;
    private wallDragStartWorld: { x: number; y: number } | undefined;
    private wallDragOrientation: WallPlacementOrientation | undefined;
    private readonly placedWallTiles = new Set<string>();

    protected mapEditorEntityUploadStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEditorModifyCustomEntityEventStoreUnsubscriber: Unsubscriber | undefined;
    protected mapEditorDeleteCustomEntityEventStoreUnsubscriber: Unsubscriber | undefined;

    constructor(mapEditorModeManager: MapEditorModeManager) {
        super(mapEditorModeManager);
        this.shiftKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.ctrlKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);

        this.handleUpdateEntity = this.updateEntity.bind(this);
        this.handleCopyEntity = this.copyEntity.bind(this);
    }

    public activate(): void {
        super.activate();
        this.createAreaPreviews();
        this.setAreaPreviewsVisibility(true);
        this.subscribeToEntityUpload();
        this.subscribeToModifyCustomEntityEventStore();
        this.subscribeToDeleteCustomEntityEventStore();

        this.bindEventHandlers();
        this.bindEntitiesManagerEventHandlers();
    }

    public clear(): void {
        super.clear();
        this.setAreaPreviewsVisibility(false);
        this.deleteAreaPreview();
        this.unbindEventHandlers();
        this.unsubscribeStore();
        this.unbindEntitiesManagerEventHandlers();
    }

    /**
     * React on commands coming from the outside
     */
    public async handleIncomingCommandMessage(editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        const commandId = editMapCommandMessage.id;
        switch (editMapCommandMessage.editMapMessage?.message?.$case) {
            case "createEntityMessage": {
                const createEntityMessage = editMapCommandMessage.editMapMessage?.message.createEntityMessage;
                const entityPrefab = await this.scene
                    .getEntitiesCollectionsManager()
                    .getEntityPrefab(createEntityMessage.collectionName, createEntityMessage.prefabId);

                if (!entityPrefab) {
                    console.warn(
                        `NO PREFAB WAS FOUND FOR: ${createEntityMessage.collectionName} ${createEntityMessage.prefabId}`,
                    );
                    return;
                }

                TexturesHelper.loadEntityTexture(this.scene, entityPrefab, entityPrefab.imagePath)
                    .then(() => {
                        const entity = this.entitiesManager.getEntities().get(createEntityMessage.id);
                        if (entity !== undefined) {
                            entity.setTexture(entityPrefab.imagePath);
                            TexturesHelper.playEntityAnimation(entity, entityPrefab);
                        }
                    })
                    .catch((reason) => {
                        console.warn(reason);
                    });

                const entityData: WAMEntityData = {
                    x: createEntityMessage.x,
                    y: createEntityMessage.y,
                    width: createEntityMessage.width,
                    height: createEntityMessage.height,
                    prefabRef: {
                        id: entityPrefab.id,
                        collectionName: entityPrefab.collectionName,
                    },
                    properties: createEntityMessage.properties,
                    name: createEntityMessage.name,
                    wall: WallPlacement.optional().parse(createEntityMessage.wall),
                };
                // execute command locally
                await this.mapEditorModeManager.executeLocalCommand(
                    new CreateEntityFrontCommand(
                        this.scene.getGameMap().getWamFile()!,
                        createEntityMessage.id,
                        entityData,
                        commandId,
                        this.entitiesManager,
                        { width: createEntityMessage.width, height: createEntityMessage.height },
                    ),
                );
                break;
            }
            case "createVegetationBatchMessage": {
                const message = editMapCommandMessage.editMapMessage.message.createVegetationBatchMessage;
                if (!message.plan) return;
                const plan = vegetationPlacementPlanFromMessage(message.plan);
                await this.mapEditorModeManager.executeLocalCommand(
                    new CreateVegetationBatchFrontCommand(
                        this.scene.getGameMap().getWamFile()!,
                        plan,
                        commandId,
                        this.entitiesManager,
                    ),
                );
                break;
            }
            case "upsertVegetationPresetMessage": {
                const message = editMapCommandMessage.editMapMessage.message.upsertVegetationPresetMessage;
                if (!message.preset) return;
                await this.mapEditorModeManager.executeLocalCommand(
                    new UpsertVegetationPresetFrontCommand(
                        this.scene.getGameMap().getWamFile()!.getWam(),
                        vegetationPresetFromMessage(message.preset),
                        message.expectedRevision,
                        commandId,
                    ),
                );
                break;
            }
            case "deleteVegetationPresetMessage": {
                const message = editMapCommandMessage.editMapMessage.message.deleteVegetationPresetMessage;
                await this.mapEditorModeManager.executeLocalCommand(
                    new DeleteVegetationPresetFrontCommand(
                        this.scene.getGameMap().getWamFile()!.getWam(),
                        message.presetId,
                        message.expectedRevision,
                        commandId,
                    ),
                );
                break;
            }
            case "deleteVegetationBatchMessage": {
                const message = editMapCommandMessage.editMapMessage.message.deleteVegetationBatchMessage;
                const placements = message.entityIds.map((id) => {
                    const entity = this.scene.getGameMap().getWamFile()!.getGameMapEntities().getEntity(id);
                    if (!entity) throw new Error(`Vegetation entity ${id} does not exist`);
                    return {
                        id,
                        prefabRef: entity.prefabRef,
                        x: entity.x,
                        y: entity.y,
                        width: entity.width ?? 1,
                        height: entity.height ?? 1,
                    };
                });
                await this.mapEditorModeManager.executeLocalCommand(
                    new DeleteVegetationBatchFrontCommand(
                        this.scene.getGameMap().getWamFile()!,
                        {
                            version: 1,
                            presetId: "undo",
                            presetRevision: 1,
                            seed: "",
                            rectangle: { x: 0, y: 0, width: 1, height: 1 },
                            placements,
                            skipped: [],
                            digest: "00000000000000000000000000000000",
                        },
                        commandId,
                        this.entitiesManager,
                    ),
                );
                break;
            }
            case "deleteEntityMessage": {
                const id = editMapCommandMessage.editMapMessage?.message.deleteEntityMessage.id;
                await this.mapEditorModeManager.executeLocalCommand(
                    new DeleteEntityFrontCommand(
                        this.scene.getGameMap().getWamFile()!,
                        id,
                        commandId,
                        this.entitiesManager,
                    ),
                );
                break;
            }
            case "modifyEntityMessage": {
                const modifyEntityMessage = editMapCommandMessage.editMapMessage?.message.modifyEntityMessage;
                await this.mapEditorModeManager.executeLocalCommand(
                    new UpdateEntityFrontCommand(
                        this.scene.getGameMap().getWamFile()!,
                        modifyEntityMessage.id,
                        {
                            ...modifyEntityMessage,
                            wall: WallPlacement.optional().parse(modifyEntityMessage.wall),
                            properties: modifyEntityMessage.modifyProperties
                                ? modifyEntityMessage.properties
                                : undefined,
                        },
                        commandId,
                        undefined,
                        this.entitiesManager,
                        this.scene,
                    ),
                );
                break;
            }
            case "uploadEntityMessage": {
                const uploadEntityMessage = editMapCommandMessage.editMapMessage?.message.uploadEntityMessage;
                await this.mapEditorModeManager.executeLocalCommand(
                    new UploadEntityFrontCommand(
                        uploadEntityMessage,
                        this.entitiesManager,
                        this.scene.getEntitiesCollectionsManager(),
                        commandId,
                        true,
                    ),
                );
                break;
            }
            case "modifyCustomEntityMessage": {
                const modifyCustomEntityMessage =
                    editMapCommandMessage.editMapMessage?.message.modifyCustomEntityMessage;
                await this.mapEditorModeManager.executeLocalCommand(
                    new ModifyCustomEntityFrontCommand(
                        modifyCustomEntityMessage,
                        this.scene.getEntitiesCollectionsManager(),
                        this.entitiesManager,
                    ),
                );
                break;
            }
            case "deleteCustomEntityMessage": {
                const deleteCustomEntityMessage =
                    editMapCommandMessage.editMapMessage?.message.deleteCustomEntityMessage;
                await this.mapEditorModeManager.executeLocalCommand(
                    new DeleteCustomEntityFrontCommand(
                        deleteCustomEntityMessage,
                        this.scene.getGameMap().getWamFile(),
                        this.entitiesManager,
                        this.scene.getEntitiesCollectionsManager(),
                    ),
                );
                break;
            }
        }
    }

    public destroy() {
        super.destroy();
        this.unbindEventHandlers();
        this.unbindEntitiesManagerEventHandlers();
        this.unsubscribeStore();
        this.setAreaPreviewsVisibility(false);
        this.deleteAreaPreview();
    }

    protected bindEntitiesManagerEventHandlers(): void {
        this.entitiesManager.on(EntitiesManagerEvent.UpdateEntity, this.handleUpdateEntity);
        this.entitiesManager.on(EntitiesManagerEvent.CopyEntity, this.handleCopyEntity);
    }

    protected bindEventHandlers() {
        this.pointerMoveEventHandler = (pointer: Pointer, gameObjects: GameObject[]) =>
            this.handlePointerMoveEvent(pointer, gameObjects);
        this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);

        this.pointerDownEventHandler = (pointer: Pointer, gameObjects: GameObject[]) =>
            this.handlePointerDownEvent(pointer, gameObjects);
        this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);

        this.pointerUpEventHandler = (pointer: Pointer) => this.handlePointerUpEvent(pointer);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.pointerUpEventHandler);

        this.shiftKey?.on(Phaser.Input.Keyboard.Events.DOWN, () => {
            this.updateWallPreviewForActivePointer();
            this.changePreviewTint();
        });

        this.shiftKey?.on(Phaser.Input.Keyboard.Events.UP, () => {
            this.updateWallPreviewForActivePointer();
            this.changePreviewTint();
        });
    }

    protected subscribeToEntityUpload() {
        this.mapEditorEntityUploadStoreUnsubscriber = mapEditorEntityUploadDraftStore.subscribe((uploadDraft) => {
            if (uploadDraft?.status === "accepted") {
                mapEditorEntityUploadDraftStore.markSubmitting(uploadDraft.commandId);
                const uploadCommand = new UploadEntityFrontCommand(
                    uploadDraft.uploadEntityMessage,
                    this.entitiesManager,
                    this.scene.getEntitiesCollectionsManager(),
                    uploadDraft.commandId,
                );

                (async () => {
                    await this.mapEditorModeManager.executeCommand(uploadCommand);
                })().catch((e) => {
                    mapEditorEntityUploadDraftStore.fail(uploadDraft.commandId, "The upload could not be submitted.");
                    console.error(e);
                    Sentry.captureException(e);
                });
            }
        });
    }

    protected subscribeToModifyCustomEntityEventStore() {
        this.mapEditorModifyCustomEntityEventStoreUnsubscriber = mapEditorModifyCustomEntityEventStore.subscribe(
            (modifyCustomEntityMessage) => {
                if (modifyCustomEntityMessage) {
                    (async () => {
                        await this.mapEditorModeManager.executeCommand(
                            new ModifyCustomEntityFrontCommand(
                                modifyCustomEntityMessage,
                                this.scene.getEntitiesCollectionsManager(),
                                this.entitiesManager,
                            ),
                        );
                        mapEditorModifyCustomEntityEventStore.set(undefined);
                    })().catch((e) => {
                        console.error(e);
                        Sentry.captureException(e);
                    });
                }
            },
        );
    }

    protected subscribeToDeleteCustomEntityEventStore() {
        this.mapEditorDeleteCustomEntityEventStoreUnsubscriber = mapEditorDeleteCustomEntityEventStore.subscribe(
            (deleteCustomEntityMessage) => {
                if (deleteCustomEntityMessage) {
                    (async () => {
                        await this.mapEditorModeManager.executeCommand(
                            new DeleteCustomEntityFrontCommand(
                                deleteCustomEntityMessage,
                                this.scene.getGameMap().getWamFile(),
                                this.entitiesManager,
                                this.scene.getEntitiesCollectionsManager(),
                            ),
                        );
                        mapEditorDeleteCustomEntityEventStore.set(undefined);
                    })().catch((e) => {
                        console.error(e);
                        Sentry.captureException(e);
                    });
                }
            },
        );
    }

    protected handlePointerMoveEvent(pointer: Pointer, gameObjects: GameObject[]): void {
        if (this.wallDragStart !== undefined && this.entityPrefab?.wall !== undefined) {
            this.extendWallDrag(pointer);
            return;
        }
        if (this.panning || (this.panCandidate && pointer.leftButtonDown())) {
            if (!this.panning) {
                if (!hasPointerDragged(pointer)) return;
                this.startPanning(pointer);
            }
            this.scene
                .getCameraManager()
                .scrollCameraByScreenDelta(pointer.prevPosition.x - pointer.x, pointer.prevPosition.y - pointer.y);
            return;
        }
        // TODO: add shadow when moving into the area
        // .setDropShadow(4, 4, 0x000000);
        if (!this.entityPrefabPreview || !this.entityPrefab) {
            return;
        }

        this.updateEntityPrefabPreviewPosition(pointer);
        this.changePreviewTint();
    }

    protected changePreviewTint(): void {
        if (!this.entityPrefabPreview || !this.entityPrefab) {
            return;
        }
        if (!this.canEntityBePlaced()) {
            this.entityPrefabPreview.setTint(0xff0000);
        } else {
            if (this.shiftKey?.isDown) {
                this.entityPrefabPreview.setTint(0xffa500);
            } else {
                this.entityPrefabPreview.clearTint();
            }
        }
        this.scene.markDirty();
    }

    protected onEntityPrefabPreviewReady(pointer: Pointer): void {
        this.updateWallPreview(pointer);
        this.updateEntityPrefabPreviewPosition(pointer);
        this.changePreviewTint();
    }

    protected handlePointerDownEvent(pointer: Pointer, gameObjects: GameObject[]): void {
        const clickedAreaPreview = this.isAreaPreviewClicked(pointer, gameObjects);

        if (this.canStartPanning(pointer, gameObjects, clickedAreaPreview)) {
            pointer.motionFactor = 0.35;
            this.panCandidate = true;
        } else {
            this.panCandidate = false;
        }

        if (get(mapEditorEntityModeStore) === "EDIT" && gameObjects.length === 0 && !clickedAreaPreview) {
            mapEditorEntityModeStore.set("ADD");
            if (document.activeElement instanceof HTMLElement) {
                document.activeElement.blur();
            }
            mapEditorSelectedEntityStore.set(undefined);
        }

        if (!this.entityPrefabPreview || !this.entityPrefab) {
            // Check that the user can open map editor to edit an area
            if (get(mapEditorActivated)) {
                if (clickedAreaPreview && get(mapEditorSelectedToolStore) !== EditorToolName.AreaEditor) {
                    this.scene.getMapEditorModeManager().equipTool(EditorToolName.AreaEditor);
                }
            }
            return;
        }

        if (this.entityPrefab.wall !== undefined) {
            if (pointer.rightButtonDown()) {
                this.cleanPreview();
                return;
            }
            if (pointer.leftButtonDown()) {
                this.startWallDrag(pointer);
            }
            return;
        }

        this.updateEntityPrefabPreviewPosition(pointer);

        if (!this.canEntityBePlaced()) {
            return;
        }

        if (pointer.rightButtonDown()) {
            this.cleanPreview();
            return;
        }
        const previewPosition = this.getEntityPrefabPreviewPosition(pointer);

        const entityId = uuidv4();

        const properties = get(mapEditorCopiedEntityDataPropertiesStore);

        const entityData: WAMEntityData = {
            x: Math.floor(previewPosition.x - this.entityPrefabPreview.displayWidth * 0.5),
            y: Math.floor(previewPosition.y - this.entityPrefabPreview.displayHeight * 0.5),
            width: this.entityPrefabPreview.displayWidth,
            height: this.entityPrefabPreview.displayHeight,
            prefabRef: this.entityPrefab,
            properties: properties ?? [],
            name: properties?.find((p) => p.type === "openFile")?.name ?? undefined,
        };

        this.mapEditorModeManager
            .executeCommand(
                new CreateEntityFrontCommand(
                    this.scene.getGameMap().getWamFile()!,
                    entityId,
                    entityData,
                    undefined,
                    this.entitiesManager,
                    { width: this.entityPrefabPreview.displayWidth, height: this.entityPrefabPreview.displayHeight },
                ),
            )
            .then(() => {
                const openEntity = this.entitiesManager.getEntities().get(entityId);
                if (get(mapEditorEntityFileDroppedStore)) mapEditorEntityFileDroppedStore.set(false);
                mapEditorEntityModeStore.set("EDIT");
                mapEditorSelectedEntityStore.set(openEntity);
            })
            .catch((e) => console.error(e));
    }

    protected unbindEventHandlers(): void {
        this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.shiftKey?.off(Phaser.Input.Keyboard.Events.DOWN);
        this.shiftKey?.off(Phaser.Input.Keyboard.Events.UP);
        this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.pointerUpEventHandler);
        this.stopPanning();
        this.resetWallDrag();
    }

    private startPanning(pointer: Pointer): void {
        pointer.motionFactor = 0.35;
        this.panning = true;
        this.scene.input.setDefaultCursor("grabbing");
        const cameraManager = this.scene.getCameraManager();
        cameraManager.setExplorationMode();
        cameraManager.stopSpeed();
    }

    private canStartPanning(pointer: Pointer, gameObjects: GameObject[], clickedAreaPreview?: boolean): boolean {
        return (
            pointer.leftButtonDown() &&
            gameObjects.length === 0 &&
            !(clickedAreaPreview ?? this.isAreaPreviewClicked(pointer, gameObjects)) &&
            this.entityPrefabPreview === undefined &&
            this.entityPrefab === undefined &&
            get(mapEditorSelectedEntityStore) === undefined
        );
    }

    private stopPanning(pointer?: Pointer): void {
        this.panCandidate = false;
        if (!this.panning) return;
        this.panning = false;
        this.scene.input.setDefaultCursor("auto");
        if (pointer?.velocity) {
            this.scene.getCameraManager().setSpeedFromScreenVelocity(pointer.velocity);
        }
    }

    protected unbindEntitiesManagerEventHandlers(): void {
        this.entitiesManager.off(EntitiesManagerEvent.UpdateEntity, this.handleUpdateEntity);
        this.entitiesManager.off(EntitiesManagerEvent.CopyEntity, this.handleCopyEntity);
    }

    protected createAreaPreviews(): AreaPreview[] {
        this.areaPreviews = [];
        const areaConfigs = this.scene.getGameMapFrontWrapper().getAreas();

        if (areaConfigs) {
            for (const config of Array.from(areaConfigs.values())) {
                this.createAreaPreview(config);
            }
        }

        this.setAreaPreviewsVisibility(false);

        return this.areaPreviews;
    }

    protected createAreaPreview(areaConfig: AreaData): AreaPreview {
        const areaPreview = new AreaPreview(
            this.scene,
            structuredClone(areaConfig),
            false,
            this.shiftKey,
            this.ctrlKey,
        );
        areaPreview.setDepth(ENTITY_EDITOR_AREA_PREVIEW_DEPTH);
        areaPreview.disableInteractive();
        this.areaPreviews.push(areaPreview);
        return areaPreview;
    }

    protected setAreaPreviewsVisibility(visible: boolean): void {
        // NOTE: I would really like to use Phaser Layers here but it seems that there's a problem with Areas still being
        //       interactive when we hide whole Layer and thus forEach is needed.
        this.areaPreviews.forEach((area) => area.setVisible(visible));
    }

    protected deleteAreaPreview(): void {
        this.areaPreviews.forEach((preview) => preview.destroy());
    }

    protected getAreasFromPosition(x: number, y: number): AreaData[] {
        const areasPreview = this.scene.getGameMapFrontWrapper().getAreas();
        if (!areasPreview) {
            return [];
        }
        return Array.from(areasPreview.values()).filter((area: AreaData) => {
            return x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height;
        });
    }

    private isAreaPreviewClicked(pointer: Pointer, gameObjects: GameObject[]): boolean {
        if (gameObjects.some((obj) => obj instanceof AreaPreview)) {
            return true;
        }

        if (gameObjects.length > 0) {
            return false;
        }

        return this.getAreasFromPosition(pointer.worldX, pointer.worldY).length > 0;
    }

    private canEntityBePlaced(): boolean {
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        if (!this.entityPrefabPreview || !this.entityPrefab) {
            return false;
        }
        const sourceColumns = Math.max(1, ...(this.entityPrefab.collisionGrid?.map((row) => row.length) ?? []));
        const sourceRows = Math.max(1, this.entityPrefab.collisionGrid?.length ?? 0);
        const frame = getScaledCollisionGridFrame(
            this.entityPrefab.collisionGrid,
            this.entityPrefabPreview.width,
            this.entityPrefabPreview.height,
            this.entityPrefabPreview.displayWidth,
            this.entityPrefabPreview.displayHeight,
            this.entityPrefab.previewOffsetX,
            this.entityPrefab.previewOffsetY,
            (this.entityPrefab.defaultSizeInTiles ?? sourceColumns) * 32,
            (this.entityPrefab.defaultHeightInTiles ?? sourceRows) * 32,
        );
        if (this.entityPrefab.wall !== undefined)
            frame.offset.y = this.entityPrefabPreview.displayHeight - frame.height;
        const position = this.entityPrefabPreview.getTopLeft();
        return gameMapFrontWrapper.canEntityBePlacedOnMap(
            position,
            this.entityPrefabPreview.displayWidth,
            this.entityPrefabPreview.displayHeight,
            getEntityCollisionRectangles(frame, position),
            undefined,
            this.entityPrefab.wall === undefined && this.shiftKey?.isDown,
        );
    }

    private updateEntityPrefabPreviewPosition(pointer: Pointer): void {
        if (!this.entityPrefabPreview || !this.entityPrefab) {
            return;
        }

        const previewPosition =
            this.entityPrefab.wall === undefined
                ? this.getEntityPrefabPreviewPosition(pointer)
                : this.getWallPreviewPosition(pointer);
        this.entityPrefabPreview.setPosition(previewPosition.x, previewPosition.y);

        this.entityPrefabPreview.setDepth(
            this.entityPrefabPreview.y +
                this.entityPrefabPreview.displayHeight * 0.5 +
                (this.entityPrefab.depthOffset ?? 0),
        );
    }

    private getEntityPrefabPreviewPosition(pointer: Pointer): { x: number; y: number } {
        return { x: pointer.worldX, y: pointer.worldY };
    }

    private startWallDrag(pointer: Pointer): void {
        this.wallDragStart = snapWorldPointToWallTile(pointer.worldX, pointer.worldY);
        this.wallDragStartWorld = { x: pointer.worldX, y: pointer.worldY };
        this.wallDragOrientation = this.shiftKey?.isDown ? "diagonal-down" : undefined;
        this.placedWallTiles.clear();
        this.updateWallPreviewForTile(this.wallDragStart, this.wallDragOrientation ?? "horizontal");
    }

    private extendWallDrag(pointer: Pointer): void {
        if (this.wallDragStart === undefined || this.entityPrefab?.wall === undefined) return;
        const current = snapWorldPointToWallTile(pointer.worldX, pointer.worldY);
        const worldDelta = {
            x: pointer.worldX - (this.wallDragStartWorld?.x ?? pointer.worldX),
            y: pointer.worldY - (this.wallDragStartWorld?.y ?? pointer.worldY),
        };
        if (this.wallDragOrientation === undefined && Math.hypot(worldDelta.x, worldDelta.y) >= 8) {
            this.wallDragOrientation = getWallDragOrientation(
                { x: 0, y: 0 },
                worldDelta,
                this.shiftKey?.isDown ?? false,
            );
        }
        if (this.wallDragOrientation === undefined) {
            this.updateWallPreviewForTile(this.wallDragStart, "horizontal");
            return;
        }
        const orientation = this.wallDragOrientation;
        const tiles = getWallDragTiles(this.wallDragStart, current, orientation);
        for (const tile of tiles) {
            const key = `${tile.x}:${tile.y}`;
            if (this.placedWallTiles.has(key)) continue;
            this.updateWallPreviewForTile(tile, orientation);
            if (!this.canEntityBePlaced()) break;
            this.placeWallTile(tile, orientation);
            this.placedWallTiles.add(key);
        }
        const lastTile = tiles[tiles.length - 1];
        if (lastTile !== undefined) this.updateWallPreviewForTile(lastTile, orientation);
        this.changePreviewTint();
    }

    private handlePointerUpEvent(pointer: Pointer): void {
        if (this.wallDragStart !== undefined && this.entityPrefab?.wall !== undefined) {
            const orientation = this.wallDragOrientation ?? (this.shiftKey?.isDown ? "diagonal-down" : "horizontal");
            if (this.placedWallTiles.size === 0) {
                this.updateWallPreviewForTile(this.wallDragStart, orientation);
                if (this.canEntityBePlaced()) this.placeWallTile(this.wallDragStart, orientation);
            }
            this.resetWallDrag();
            this.updateWallPreview(pointer);
            this.updateEntityPrefabPreviewPosition(pointer);
            this.changePreviewTint();
            return;
        }
        this.stopPanning(pointer);
    }

    private placeWallTile(tile: WallTile, orientation: WallPlacementOrientation): void {
        if (!this.entityPrefabPreview || !this.entityPrefab) return;
        const properties = get(mapEditorCopiedEntityDataPropertiesStore);
        const entityData: WAMEntityData = {
            x: tile.x * 32,
            y: Math.floor((tile.y + 1) * 32 - this.entityPrefabPreview.displayHeight),
            width: this.entityPrefabPreview.displayWidth,
            height: this.entityPrefabPreview.displayHeight,
            prefabRef: { collectionName: this.entityPrefab.collectionName, id: this.entityPrefab.id },
            properties: properties ?? [],
            name: properties?.find((property) => property.type === "openFile")?.name ?? undefined,
            wall: { version: 1, orientation },
        };
        this.mapEditorModeManager
            .executeCommand(
                new CreateEntityFrontCommand(
                    this.scene.getGameMap().getWamFile()!,
                    uuidv4(),
                    entityData,
                    undefined,
                    this.entitiesManager,
                    { width: entityData.width!, height: entityData.height! },
                ),
            )
            .catch((error) => console.error(error));
    }

    private updateWallPreviewForActivePointer(): void {
        if (this.wallDragStart !== undefined) return;
        this.updateWallPreview(this.scene.input.activePointer);
        this.updateEntityPrefabPreviewPosition(this.scene.input.activePointer);
    }

    private updateWallPreview(pointer: Pointer): void {
        if (!this.entityPrefab?.wall || !this.entityPrefabPreview) return;
        const orientation = this.shiftKey?.isDown ? "diagonal-down" : "horizontal";
        applyWallTextureToPreview(this.scene, this.entityPrefabPreview, this.entityPrefab, orientation);
        const tile = snapWorldPointToWallTile(pointer.worldX, pointer.worldY);
        this.setWallPreviewPosition(tile);
    }

    private updateWallPreviewForTile(tile: WallTile, orientation: WallPlacementOrientation): void {
        if (!this.entityPrefab?.wall || !this.entityPrefabPreview) return;
        applyWallTextureToPreview(this.scene, this.entityPrefabPreview, this.entityPrefab, orientation);
        this.setWallPreviewPosition(tile);
    }

    private getWallPreviewPosition(pointer: Pointer): { x: number; y: number } {
        const tile = snapWorldPointToWallTile(pointer.worldX, pointer.worldY);
        return this.getWallPreviewPositionForTile(tile);
    }

    private setWallPreviewPosition(tile: WallTile): void {
        if (!this.entityPrefabPreview) return;
        const position = this.getWallPreviewPositionForTile(tile);
        this.entityPrefabPreview.setPosition(position.x, position.y);
    }

    private getWallPreviewPositionForTile(tile: WallTile): { x: number; y: number } {
        if (!this.entityPrefabPreview) return { x: tile.x * 32 + 16, y: tile.y * 32 + 16 };
        return {
            x: tile.x * 32 + this.entityPrefabPreview.displayWidth * 0.5,
            y: (tile.y + 1) * 32 - this.entityPrefabPreview.displayHeight * 0.5,
        };
    }

    private resetWallDrag(): void {
        this.wallDragStart = undefined;
        this.wallDragStartWorld = undefined;
        this.wallDragOrientation = undefined;
        this.placedWallTiles.clear();
    }

    private updateEntity(entityData: EntityData) {
        const oldBounds = this.entitiesManager.getEntities().get(entityData.id)?.consumeEditorBoundsBeforeResize();
        // Create commande to update entity data
        this.mapEditorModeManager
            .executeCommand(
                new UpdateEntityFrontCommand(
                    this.scene.getGameMap().getWamFile()!,
                    entityData.id,
                    {
                        ...entityData,
                    },
                    undefined,
                    oldBounds,
                    this.entitiesManager,
                    this.scene,
                ),
            )
            .catch((e) => console.error(e));
    }

    private copyEntity = (data: CopyEntityEventData) => {
        if (!CopyEntityEventData.parse(data)) {
            return;
        }
        const entityData: WAMEntityData = {
            x: data.position.x,
            y: data.position.y,
            width: data.entityDimensions.width,
            height: data.entityDimensions.height,
            prefabRef: data.prefabRef,
            properties: data.properties ?? [],
            wall: data.wall,
        };
        this.mapEditorModeManager
            .executeCommand(
                new CreateEntityFrontCommand(
                    this.scene.getGameMap().getWamFile()!,
                    undefined,
                    entityData,
                    undefined,
                    this.entitiesManager,
                    data.entityDimensions,
                ),
            )
            .catch((e) => console.error(e));
        this.cleanPreview();
    };

    private unsubscribeStore() {
        this.mapEditorEntityUploadStoreUnsubscriber?.();
        this.mapEditorModifyCustomEntityEventStoreUnsubscriber?.();
        this.mapEditorDeleteCustomEntityEventStoreUnsubscriber?.();
    }
}
