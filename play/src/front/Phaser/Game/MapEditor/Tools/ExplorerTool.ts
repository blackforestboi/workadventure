import * as Phaser from "phaser";
import type { EditMapCommandMessage } from "@workadventure/messages";
import debug from "debug";
import type { Unsubscriber } from "svelte/store";
import { get } from "svelte/store";
import type { AreaData, AreaDescriptionPropertyData } from "@workadventure/map-editor";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import { analyticsClient } from "../../../../Administration/AnalyticsClient";
import {
    mapEditorVisibilityStore,
    mapExplorationAreasStore,
    mapExplorationEntitiesStore,
    mapExplorationModeStore,
    mapExplorationObjectSelectedStore,
} from "../../../../Stores/MapEditorStore";
import { gameManager } from "../../GameManager";
import type { GameScene } from "../../GameScene";
import { Entity } from "../../../ECS/Entity";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import type { EntitiesManager } from "../../GameMap/EntitiesManager";
import { AreaPreview } from "../../../Components/MapEditor/AreaPreview";
import { waScaleManager } from "../../../Services/WaScaleManager";
import { enableUserInputsStore } from "../../../../Stores/UserInputStore";
import { hasPointerDragged, isPrimaryPointerDown } from "../PanGesture";
import type { MapEditorTool } from "./MapEditorTool";

import Pointer = Phaser.Input.Pointer;
import GameObject = Phaser.GameObjects.GameObject;

const logger = debug("explorer-tool");
const EXPLORER_KEYBOARD_BASE_SPEED = 10;
const EXPLORER_KEYBOARD_SPEED_UP_MULTIPLIER = 2.5;

export class ExplorerTool implements MapEditorTool {
    private downIsPressed = false;
    private upIsPressed = false;
    private leftIsPressed = false;
    private rightIsPressed = false;
    private explorationPanCandidate = false;
    private explorationMouseIsActive = false;
    private entitiesManager: EntitiesManager;
    private lastCameraCenterXToZoom = 0;
    private lastCameraCenterYToZoom = 0;
    private mapExplorationEntitiesSubscribe: Unsubscriber | undefined;
    private enableUserInputsStoreSubscribe: Unsubscriber | undefined;
    private zoomLevelBeforeExplorerMode: number | undefined;
    private readonly shiftKey: Phaser.Input.Keyboard.Key | undefined;

    private keyDownHandler = (event: KeyboardEvent) => {
        if (!get(enableUserInputsStore)) return;
        if (event.key === "ArrowDown" || event.key === "s") {
            this.downIsPressed = true;
        }
        if (event.key === "ArrowUp" || event.key === "w" || event.key === "z") {
            this.upIsPressed = true;
        }
        if (event.key === "ArrowLeft" || event.key === "q" || event.key === "a") {
            this.leftIsPressed = true;
        }
        if (event.key === "ArrowRight" || event.key === "d") {
            this.rightIsPressed = true;
        }
    };
    private keyUpHandler = (event: KeyboardEvent) => {
        if (!get(enableUserInputsStore)) return;
        // Define new zone to zoom
        if (event.key === "ArrowDown" || event.key === "s") {
            this.downIsPressed = false;
        }
        if (event.key === "ArrowUp" || event.key === "w" || event.key === "z") {
            this.upIsPressed = false;
        }
        if (event.key === "ArrowLeft" || event.key === "q" || event.key === "a") {
            this.leftIsPressed = false;
        }
        if (event.key === "ArrowRight" || event.key === "d") {
            this.rightIsPressed = false;
        }
        this.mapEditorModeManager.handleKeyDownEvent(event);
    };
    private wheelHandler = (
        pointer: Pointer,
        gameObjects: GameObject[],
        deltaX: number,
        deltaY: number,
        deltaZ: number,
    ) => {
        this.scene.handleMouseWheel(pointer, deltaY);
    };
    private pointerDownHandler = (pointer: Pointer) => {
        this.explorationPanCandidate = isPrimaryPointerDown(pointer);
        if (!this.explorationPanCandidate) return;
        this.scene.getCameraManager().stopSpeed();
        // The motion factor is used to smooth out the velocity of the camera.
        // By default, the 0.2 value is too low and if we release the pointer when the mouse is not moving but has
        // moved 0.1 second before, the camera will continue to move.
        // 0.35 seems a more sensible default.
        pointer.motionFactor = 0.35;
    };
    private pointerMoveHandler = (pointer: Pointer) => {
        if (!this.explorationPanCandidate || !pointer.leftButtonDown()) return;
        if (!this.explorationMouseIsActive) {
            if (!hasPointerDragged(pointer)) return;
            this.explorationMouseIsActive = true;
            this.scene.input.setDefaultCursor("grabbing");
        }

        this.scene
            .getCameraManager()
            .scrollCameraByScreenDelta(pointer.prevPosition.x - pointer.x, pointer.prevPosition.y - pointer.y);
    };
    private pointerUpHandler = (pointer: Pointer, gameObjects: GameObject[]) => {
        const wasPanning = this.explorationMouseIsActive;
        this.explorationPanCandidate = false;
        this.explorationMouseIsActive = false;
        this.scene.input.setDefaultCursor("auto");

        if (gameObjects.length > 0) {
            const gameObject = gameObjects[0];
            if (gameObject instanceof Entity || gameObject instanceof AreaPreview)
                mapExplorationObjectSelectedStore.set(gameObject);
        }

        // The velocity will be null if the cursor is no longer above the game when the button is released
        if (wasPanning && pointer.velocity) {
            // Let's compute the remaining velocity
            this.scene.getCameraManager().setSpeedFromScreenVelocity(pointer.velocity);
        }

        this.scene.markDirty();
    };

    private pointerOverHandler = (gameObject: AreaPreview) => {
        if (gameObject.strokeColor === 0xf9e82d) return;
        gameObject.setStrokeStyle(2, 0xf9e82d);
        this.scene.markDirty();
    };
    private pointerOutHandler = (gameObject: AreaPreview) => {
        if (gameObject.strokeColor === 0x000000) return;
        gameObject.setStrokeStyle(2, 0x000000);
        this.scene.markDirty();
    };

    constructor(
        private mapEditorModeManager: MapEditorModeManager,
        private readonly scene: GameScene,
    ) {
        this.shiftKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
        this.entitiesManager = this.scene.getGameMapFrontWrapper().getEntitiesManager();
    }

    public update(time: number, dt: number): void {
        if (!get(enableUserInputsStore)) return;
        const factorToMove =
            (EXPLORER_KEYBOARD_BASE_SPEED * (this.shiftKey?.isDown ? EXPLORER_KEYBOARD_SPEED_UP_MULTIPLIER : 1)) /
            waScaleManager.zoomModifier;
        if (this.downIsPressed) {
            this.scene.getCameraManager().scrollCamera(0, factorToMove);
        }
        if (this.upIsPressed) {
            this.scene.getCameraManager().scrollCamera(0, -factorToMove);
        }
        if (this.leftIsPressed) {
            this.scene.getCameraManager().scrollCamera(-factorToMove, 0);
        }
        if (this.rightIsPressed) {
            this.scene.getCameraManager().scrollCamera(factorToMove, 0);
        }

        get(mapExplorationAreasStore)?.forEach((preview) => preview.update(time, dt));
    }

    public clear(): void {
        // Put analytics for exploration mode
        analyticsClient.closeExplorationMode();

        // Restore controls of the scene
        this.scene.userInputManager.restoreControls("explorerTool");
        this.scene.userInputManager.restoreRightClick();

        // Remove all controls for the exploration mode
        this.scene.input.keyboard?.off("keydown", this.keyDownHandler);
        this.scene.input.keyboard?.off("keyup", this.keyUpHandler);
        this.scene.input.off("wheel", this.wheelHandler);
        this.scene.input.off("pointerdown", this.pointerDownHandler);
        this.scene.input.off("pointermove", this.pointerMoveHandler);
        this.scene.input.off("pointerup", this.pointerUpHandler);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.pointerUpHandler);

        // Restore focus target
        waScaleManager.setFocusTarget(undefined);

        const cameraManager = this.scene.getCameraManager();
        cameraManager.stopSpeed();

        // Switching from Explore to another editor tool must keep the editor-owned camera target.
        // Player-follow mode is restored only when the map editor itself is closing.
        if (!this.mapEditorModeManager.isActive()) {
            let targetZoom = undefined;
            // If the current zoom level is above the resistance level, we need to zoom back in.
            // This happens when we close the explorer mode via a button.
            // If we close by zooming in, there is no need to override the zoom level.
            if (waScaleManager.zoomModifier < cameraManager.resistanceEndZoomLevel) {
                targetZoom = this.zoomLevelBeforeExplorerMode;

                if (targetZoom === undefined || targetZoom < cameraManager.resistanceEndZoomLevel) {
                    // In case we zoomed out with the mouse, but we closed
                    targetZoom = cameraManager.resistanceEndZoomLevel;
                }
            }

            // Restore camera mode
            cameraManager.startFollowPlayer(this.scene.CurrentPlayer, 1000);
            if (targetZoom) {
                const targetZoomFactor = targetZoom / waScaleManager.zoomModifier;
                cameraManager.zoomByFactor(targetZoomFactor, 1000);
            }
        }

        // Make all entities non interactive
        this.setAllEntitiesNotInteractive();
        // Restore entities
        this.removeAllAreasPreviewPointedToEditColor();

        // Restore cursor
        this.scene.input.setDefaultCursor("auto");

        // Restore zoom factor
        //if (waScaleManager.zoomModifier < INITIAL_ZOOM_OUT_EXPLORER_MODE) this.scene.zoomByFactor(3);

        // Define initial zoom max
        //waScaleManager.maxZoomOut = INITIAL_ZOOM_OUT_EXPLORER_MODE;

        // Mark the scene as dirty
        this.scene.markDirty();

        // Unsubscribe to entities store
        if (this.mapExplorationEntitiesSubscribe) this.mapExplorationEntitiesSubscribe();
        if (this.enableUserInputsStoreSubscribe) this.enableUserInputsStoreSubscribe();

        // Disable store of map exploration mode
        mapExplorationObjectSelectedStore.set(undefined);
        mapExplorationModeStore.set(false);
        mapExplorationAreasStore.set(undefined);
    }
    public activate(): void {
        // Put analytics for exploration mode
        analyticsClient.openExplorationMode();

        // Active store of map exploration mode
        mapExplorationModeStore.set(true);
        mapEditorVisibilityStore.set(true);

        const entitySearchableMap = new Map<string, Entity>();
        gameManager
            .getCurrentGameScene()
            .getGameMapFrontWrapper()
            .getEntitiesManager()
            .getEntities()
            .forEach((entity, key) => {
                if (entity.searchable) {
                    entitySearchableMap.set(key, entity);
                }
            });
        mapExplorationEntitiesStore.set(entitySearchableMap);

        // Define new cursor
        this.scene.input.setDefaultCursor("auto");

        // Disable controls of the scene
        this.scene.userInputManager.disableControls("explorerTool");
        this.scene.userInputManager.disableRightClick();
        // Implement all controls for the exploration mode
        this.scene.input.setTopOnly(false);
        this.scene.input.keyboard?.on("keydown", this.keyDownHandler);
        this.scene.input.keyboard?.on("keyup", this.keyUpHandler);
        this.scene.input.on("wheel", this.wheelHandler);
        this.scene.input.on("pointerdown", this.pointerDownHandler);
        this.scene.input.on("pointermove", this.pointerMoveHandler);
        this.scene.input.on("pointerup", this.pointerUpHandler);
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.pointerUpHandler);

        this.zoomLevelBeforeExplorerMode = waScaleManager.zoomModifier;

        // Make all entities interactive
        this.setAllEntitiesInteractive();
        this.setAllAreasPreviewPointedToEditColor();

        this.scene.playSound("audio-cloud");

        // Mark the scene as dirty
        this.scene.markDirty();
    }
    public destroy(): void {
        this.clear();
    }
    public subscribeToGameMapFrontWrapperEvents(gameMapFrontWrapper: GameMapFrontWrapper): void {
        logger("subscribeToGameMapFrontWrapperEvents => Method not implemented.");
    }
    public handleKeyDownEvent(event: KeyboardEvent): void {
        logger("handleKeyDownEvent => Method not implemented.");
    }
    public handleIncomingCommandMessage(editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        // Refresh the entities store
        mapExplorationEntitiesStore.set(
            gameManager.getCurrentGameScene().getGameMapFrontWrapper().getEntitiesManager().getEntities(),
        );
        return Promise.resolve();
    }

    private setAllAreasPreviewPointedToEditColor() {
        const areaConfigs = this.scene.getGameMapFrontWrapper().getAreas();
        const areaPreviews = get(mapExplorationAreasStore) ?? new Map<string, AreaPreview>();
        if (!areaConfigs) return;
        for (const [key, config] of areaConfigs.entries()) {
            if (
                !(config.properties.find((p) => p.type === "areaDescriptionProperties") as AreaDescriptionPropertyData)
                    ?.searchable
            )
                continue;
            let areaPreview = areaPreviews.get(key);
            if (areaPreview) {
                areaPreview.updatePreview(config);
            } else {
                areaPreview = this.createAndSaveAreaPreview(config);
            }
            areaPreview.on(Phaser.Input.Events.POINTER_OVER, () => {
                this.pointerOverHandler(areaPreview);
            });
            areaPreview.on(Phaser.Input.Events.POINTER_OUT, () => {
                this.pointerOutHandler(areaPreview);
            });
            areaPreviews.set(key, areaPreview);

            // Set the initial stroke color to edit color
            areaPreview.setStrokeStyle(2, 0x000000);
        }
        mapExplorationAreasStore.set(areaPreviews);
    }

    private removeAllAreasPreviewPointedToEditColor() {
        const areas = get(mapExplorationAreasStore);
        if (!areas) return;
        for (const [key, area] of areas.entries()) {
            area.setVisible(false);
            area.destroy();
            areas.delete(key);
        }
        areas.clear();
    }

    private createAndSaveAreaPreview(areaConfig: AreaData): AreaPreview {
        // Like trash tool, area previews must override depth to be always on top. The area previews has opacity that permits to see underneath.
        return new AreaPreview(this.scene, structuredClone(areaConfig), true);
    }

    private defineZoomToCenterCameraPositionTimeOut?: NodeJS.Timeout;
    public defineZoomToCenterCameraPosition() {
        if (this.defineZoomToCenterCameraPositionTimeOut) clearTimeout(this.defineZoomToCenterCameraPositionTimeOut);
        // FIXME from the svelte component, the update isn't dispatch in totally at the same time after to move the camera
        this.defineZoomToCenterCameraPositionTimeOut = setTimeout(() => {
            this.doDefineZoomToCenterCameraPosition();
            this.defineZoomToCenterCameraPositionTimeOut = undefined;
        }, 0);
    }

    private doDefineZoomToCenterCameraPosition() {
        const cameraCenterXToZoom = this.scene.cameras.main.worldView.x + this.scene.cameras.main.worldView.width / 2;
        const cameraCenterYToZoom = this.scene.cameras.main.worldView.y + this.scene.cameras.main.worldView.height / 2;
        if (
            cameraCenterXToZoom != this.lastCameraCenterXToZoom ||
            cameraCenterYToZoom != this.lastCameraCenterYToZoom
        ) {
            waScaleManager.setFocusTarget({ x: cameraCenterXToZoom, y: cameraCenterYToZoom });
            this.lastCameraCenterXToZoom = cameraCenterXToZoom;
            this.lastCameraCenterYToZoom = cameraCenterYToZoom;
        }
    }

    private definePointerOutForEntity(entity: Entity) {
        // If the entity is selected, keep the active yellow color
        if (get(mapExplorationObjectSelectedStore) == entity) {
            entity.setPointedToEditColor(0xf9e82d);
        } else {
            entity.setPointedToEditColor(0x00000);
        }
        this.scene.markDirty();
    }

    private setAllEntitiesInteractive() {
        this.entitiesManager.makeAllEntitiesInteractive();
        this.entitiesManager.getEntities().forEach((entity) => {
            if (entity.searchable) {
                entity.setPointedToEditColor(0x00000);
                entity.on(Phaser.Input.Events.POINTER_OUT, () => this.definePointerOutForEntity(entity));
            }
        });
    }

    private setAllEntitiesNotInteractive() {
        this.entitiesManager.getEntities().forEach((entity) => {
            if (entity.searchable) {
                entity.removePointedToEditColor();
                entity.off(Phaser.Input.Events.POINTER_OUT, () => this.definePointerOutForEntity(entity));
            }
        });
        this.entitiesManager.makeAllEntitiesNonInteractive();
    }
}
