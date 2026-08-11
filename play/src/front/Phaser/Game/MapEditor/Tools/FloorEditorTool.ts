import {
    addTeapotEmbeddedTileset,
    applyTeapotTerrainMutation,
    applyTeapotTilePatch,
    type TeapotTerrainMutation,
    TeapotTilePatch,
    type TeapotTileRegion,
} from "@workadventure/map-editor";
import type { EditMapCommandMessage } from "@workadventure/messages";
import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";
import * as Phaser from "phaser";
import type { GameObjects } from "phaser";
import { get, type Unsubscriber } from "svelte/store";
import { asError } from "catch-unknown";

import {
    createTerrainAutotileRegion,
    normalizeTerrainRectangle,
    translateTerrainAutotileTiles,
    type TerrainAutotileTiles,
} from "../../../../../common/Teapot/TerrainAutotile";
import {
    mapEditorFloorActionStore,
    mapEditorFloorStateStore,
    type MapEditorFloorAction,
    type MapEditorFloorState,
    type MapEditorFloorTilesetAsset,
} from "../../../../Stores/MapEditorFloorStore";
import { BUILT_IN_TERRAIN_TILESET, getBuiltInTerrainTileIds } from "../../../../Services/BuiltInTerrainCatalog";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../GameScene";
import { ModifyTerrainFrontCommand } from "../Commands/Terrain/ModifyTerrainFrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { hasPointerDragged } from "../PanGesture";
import { createFloorEdit, type FloorEdit } from "./FloorEditorHistory";
import { collectTerrainGids, getTerrainTilesetGids } from "./FloorEditorCatalog";
import { findTilesetForGid, tileLayerCanRenderGid } from "./FloorEditorRendering";
import { MapEditorTool } from "./MapEditorTool";

type TilesetSelection =
    | { kind: "tile"; layer: string; tileId: number }
    | { kind: "shape"; layer: string; familyId: string; autotile: TerrainAutotileTiles };

type PendingTilesetSelection = TilesetSelection & { firstGid: number; tileCount: number };

export class FloorEditorTool extends MapEditorTool {
    private readonly scene: GameScene;
    private readonly mapEditorModeManager: MapEditorModeManager;
    private actionUnsubscriber: Unsubscriber | undefined;
    private publishedMap: ITiledMap | undefined;
    private draftMap: ITiledMap | undefined;
    private draftBaseMap: ITiledMap | undefined;
    private previewRegions: readonly TeapotTileRegion[] = [];
    private handlingAction = false;
    private active = false;
    private saving = false;
    private readonly runtimeTilesets: { firstGid: number; tileCount: number; textureKey: string }[] = [];
    private readonly tileOverlays = new Map<string, GameObjects.Image>();
    private readonly changedTileKeys = new Set<string>();
    private selectedLayer = "";
    private selectedGid = 0;
    private pendingTilesetSelection: PendingTilesetSelection | undefined;
    private selectedAutotile: { familyId: string; tiles: TerrainAutotileTiles } | undefined;
    private shapeStart: { layer: string; x: number; y: number } | undefined;
    private shapeEnd: { layer: string; x: number; y: number } | undefined;
    private shapeOutline: GameObjects.Graphics | undefined;
    private hoveredTile: { layer: string; x: number; y: number } | undefined;
    private hoverTilePreview: GameObjects.Image | undefined;
    private hoverOutline: GameObjects.Graphics | undefined;
    private painting = false;
    private panCandidate = false;
    private panning = false;
    private lastPaintedTileKey: string | undefined;
    private activeEditGroup: FloorEdit[] | undefined;
    private readonly pointerMoveEventHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer);
    private readonly pointerDownEventHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer);
    private readonly pointerUpEventHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer);
    private readonly pointerOutEventHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerOut(pointer);

    constructor(mapEditorModeManager: MapEditorModeManager) {
        super();
        this.mapEditorModeManager = mapEditorModeManager;
        this.scene = this.mapEditorModeManager.getScene();
    }

    public update(_time: number, _dt: number): void {}

    public clear(): void {
        this.clearHoverPreview();
        this.unbindPointerEvents();
        this.active = false;
        this.hoverOutline?.destroy();
        this.hoverOutline = undefined;
        this.shapeOutline?.destroy();
        this.shapeOutline = undefined;
        mapEditorFloorStateStore.set(undefined);
    }

    public activate(): void {
        this.active = true;
        this.saving = false;
        this.pendingTilesetSelection = undefined;
        this.selectedAutotile = undefined;
        this.shapeStart = undefined;
        this.shapeEnd = undefined;
        this.publishedMap = structuredClone(this.scene.mapFile);
        this.draftMap = undefined;
        this.draftBaseMap = undefined;
        this.previewRegions = [];
        this.changedTileKeys.clear();
        this.bindPointerEvents();
        this.installActionSubscription();
        this.setState({ status: "idle", error: undefined });
        this.updateCursor();
        this.loadEmbeddedRuntimeTilesets(this.publishedMap).catch(() => undefined);
    }

    public destroy(): void {
        this.clearHoverPreview();
        this.unbindPointerEvents();
        this.active = false;
        this.hoverOutline?.destroy();
        this.hoverOutline = undefined;
        this.shapeOutline?.destroy();
        this.shapeOutline = undefined;
        this.actionUnsubscriber?.();
        this.actionUnsubscriber = undefined;
    }

    public subscribeToGameMapFrontWrapperEvents(_gameMapFrontWrapper: GameMapFrontWrapper): void {}

    public handleKeyDownEvent(event: KeyboardEvent): void {
        if (event.key !== "Escape") return;
        if (this.shapeStart !== undefined) this.cancelShapeDrag();
        else this.finishPaintStroke();
    }

    public async handleIncomingCommandMessage(editMapCommandMessage: EditMapCommandMessage): Promise<void> {
        const message = editMapCommandMessage.editMapMessage?.message;
        if (
            message?.$case !== "modifyTerrainMessage" ||
            message.modifyTerrainMessage.mapUrl !== this.scene.getMapUrl()
        ) {
            return;
        }
        this.applyTerrainMutation({
            mapId: message.modifyTerrainMessage.mapUrl,
            regions: message.modifyTerrainMessage.regions,
            tilesetJson: message.modifyTerrainMessage.tilesetJson || undefined,
            removeTileset: message.modifyTerrainMessage.removeTileset,
        });
        if (message.modifyTerrainMessage.tilesetJson !== "" && !message.modifyTerrainMessage.removeTileset) {
            await this.loadEmbeddedRuntimeTilesets(this.draftMap ?? this.scene.mapFile);
        }
        this.acknowledgeTerrainMutation();
    }

    private installActionSubscription(): void {
        if (this.actionUnsubscriber !== undefined) return;
        let lastActionId: string | undefined;
        this.actionUnsubscriber = mapEditorFloorActionStore.subscribe((action) => {
            if (action === undefined || action.id === lastActionId || this.handlingAction) return;
            lastActionId = action.id;
            this.handlingAction = true;
            this.handleAction(action)
                .finally(() => {
                    this.handlingAction = false;
                })
                .catch(() => undefined);
        });
    }

    private handleAction(action: MapEditorFloorAction): Promise<void> {
        try {
            if (action.type === "preview") {
                const patch = TeapotTilePatch.parse(action.patch);
                const source = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
                if (source === undefined) throw new Error("The current map is not loaded");
                const edit = createFloorEdit(source, patch);
                this.preview(patch, false);
                if (edit !== undefined) this.commitEdits([edit]);
                return Promise.resolve();
            }
            if (action.type === "select-brush") {
                this.selectBrush(action.layer, action.gid);
                return Promise.resolve();
            }
            if (action.type === "select-library-brush") {
                this.addTileset(action.tileset, { kind: "tile", layer: action.layer, tileId: action.tileId });
                return Promise.resolve();
            }
            if (action.type === "select-library-shape") {
                this.addTileset(action.tileset, {
                    kind: "shape",
                    layer: action.layer,
                    familyId: action.familyId,
                    autotile: action.autotile,
                });
                return Promise.resolve();
            }
            if (action.type === "add-tileset") {
                this.addTileset(action.tileset);
                return Promise.resolve();
            }
            return Promise.resolve();
        } catch (error: unknown) {
            this.setState({
                status: "failed",
                error: asError(error).message,
            });
            return Promise.resolve();
        }
    }

    private preview(patch: TeapotTilePatch, recordHistory = true): void {
        if (this.publishedMap === undefined) throw new Error("The current map is not loaded");
        if (patch.mapId !== this.scene.getMapUrl()) throw new Error("This patch belongs to a different map");
        this.clearHoverPreview();
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const edit = recordHistory ? createFloorEdit(visibleMap, patch) : undefined;
        const result = applyTeapotTilePatch(visibleMap, patch);
        this.draftMap = result.map;
        this.previewRegions = [...this.previewRegions, ...patch.regions];
        this.updateChangedTileKeys(patch.regions, result.map);
        this.renderRegions(patch.regions, result.map);
        if (edit !== undefined && this.activeEditGroup !== undefined) this.activeEditGroup.push(edit);
        this.setState({ status: "saving", changedTiles: this.changedTileKeys.size, error: undefined });
    }

    private selectBrush(layer: string, gid: number): void {
        const state = get(mapEditorFloorStateStore);
        if (layer === "") {
            this.clearBrush();
            return;
        }
        if (state === undefined || !state.layers.some((candidate) => candidate.name === layer)) return;
        if (gid !== 0 && !state.tilesets.some((tileset) => tileset.tileGids.includes(gid))) return;
        if (this.selectedLayer === layer && this.selectedGid === gid && state.toolMode === "tile") {
            this.clearBrush();
            return;
        }
        this.clearHoverPreview();
        this.cancelShapeDrag();
        this.selectedAutotile = undefined;
        this.selectedLayer = layer;
        this.selectedGid = gid;
        this.setState({
            selectedLayer: layer,
            selectedGid: gid,
            toolMode: "tile",
            selectedTerrainFamilyId: undefined,
            error: undefined,
        });
        this.updateCursor();
    }

    private clearBrush(): void {
        this.clearHoverPreview();
        this.cancelShapeDrag();
        this.selectedAutotile = undefined;
        this.selectedLayer = "";
        this.setState({
            selectedLayer: this.selectedLayer,
            selectedGid: this.selectedGid,
            toolMode: "tile",
            selectedTerrainFamilyId: undefined,
            error: undefined,
        });
        this.updateCursor();
    }

    private bindPointerEvents(): void {
        this.scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.on(Phaser.Input.Events.POINTER_OUT, this.pointerOutEventHandler);
        this.scene.input.on(Phaser.Input.Events.GAME_OUT, this.pointerOutEventHandler);
    }

    private unbindPointerEvents(): void {
        this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.pointerMoveEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.pointerDownEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.pointerUpEventHandler);
        this.scene.input.off(Phaser.Input.Events.POINTER_OUT, this.pointerOutEventHandler);
        this.scene.input.off(Phaser.Input.Events.GAME_OUT, this.pointerOutEventHandler);
        this.scene.input.setDefaultCursor("auto");
        this.stopPanning();
        this.cancelShapeDrag();
        this.finishPaintStroke();
    }

    private handlePointerMove(pointer: Phaser.Input.Pointer): void {
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
        const tile = this.getTileAtPointer(pointer);
        if (tile === undefined) {
            if (this.shapeStart === undefined) this.clearHoverPreview();
            return;
        }
        if (this.shapeStart !== undefined && this.selectedAutotile !== undefined && pointer.leftButtonDown()) {
            this.shapeEnd = tile;
            this.showShapeOutline(this.shapeStart, tile);
            return;
        }
        const key = tileKey(tile.layer, tile.x, tile.y);
        if (
            this.hoveredTile === undefined ||
            tileKey(this.hoveredTile.layer, this.hoveredTile.x, this.hoveredTile.y) !== key
        ) {
            this.showHoverPreview(tile);
        }
        if (this.painting && pointer.leftButtonDown() && key !== this.lastPaintedTileKey) {
            this.paintTile(tile);
        }
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        if (!pointer.leftButtonDown()) return;
        if (this.selectedLayer === "") {
            pointer.motionFactor = 0.35;
            this.panCandidate = true;
            return;
        }
        if (this.saving) return;
        const tile = this.getTileAtPointer(pointer);
        if (tile === undefined) return;
        if (this.selectedAutotile !== undefined) {
            this.painting = true;
            this.shapeStart = tile;
            this.shapeEnd = tile;
            this.showShapeOutline(tile, tile);
            return;
        }
        this.painting = true;
        this.lastPaintedTileKey = undefined;
        this.activeEditGroup = [];
        this.paintTile(tile);
    }

    private handlePointerUp(pointer: Phaser.Input.Pointer): void {
        this.stopPanning(pointer);
        if (this.shapeStart !== undefined && this.shapeEnd !== undefined && this.selectedAutotile !== undefined) {
            this.finishShapeDrag();
            return;
        }
        this.finishPaintStroke();
    }

    private handlePointerOut(pointer: Phaser.Input.Pointer): void {
        this.handlePointerUp(pointer);
        this.clearHoverPreview();
    }

    private startPanning(pointer: Phaser.Input.Pointer): void {
        pointer.motionFactor = 0.35;
        this.panning = true;
        this.scene.input.setDefaultCursor("grabbing");
        const cameraManager = this.scene.getCameraManager();
        cameraManager.setExplorationMode();
        cameraManager.stopSpeed();
    }

    private stopPanning(pointer?: Phaser.Input.Pointer): void {
        this.panCandidate = false;
        if (!this.panning) return;
        this.panning = false;
        this.updateCursor();
        if (pointer?.velocity) {
            this.scene.getCameraManager().setSpeedFromScreenVelocity(pointer.velocity);
        }
    }

    private updateCursor(): void {
        this.scene.input.setDefaultCursor(this.selectedLayer === "" ? "auto" : "crosshair");
    }

    private getTileAtPointer(pointer: Phaser.Input.Pointer): { layer: string; x: number; y: number } | undefined {
        if (this.publishedMap === undefined || this.selectedLayer === "") return undefined;
        const layer = findLayer(this.publishedMap.layers, this.selectedLayer);
        const phaserLayer = this.scene.getGameMapFrontWrapper().findPhaserLayer(this.selectedLayer);
        if (layer?.type !== "tilelayer" || phaserLayer === undefined) return undefined;
        const coordinates = phaserLayer.worldToTileXY(pointer.worldX, pointer.worldY, true);
        const x = Math.floor(coordinates.x);
        const y = Math.floor(coordinates.y);
        const width = layer.width ?? this.publishedMap.width ?? 0;
        const height = layer.height ?? this.publishedMap.height ?? 0;
        if (x < 0 || y < 0 || x >= width || y >= height) return undefined;
        return { layer: this.selectedLayer, x, y };
    }

    private paintTile(tile: { layer: string; x: number; y: number }): void {
        if (this.publishedMap === undefined) return;
        const key = tileKey(tile.layer, tile.x, tile.y);
        this.lastPaintedTileKey = key;
        this.preview(
            TeapotTilePatch.parse({
                mapId: this.scene.getMapUrl(),
                expectedRevision: 0,
                regions: [{ ...tile, width: 1, height: 1, gids: [this.selectedGid] }],
            }),
        );
        this.showHoverPreview(tile);
    }

    private finishShapeDrag(): void {
        const start = this.shapeStart;
        const end = this.shapeEnd;
        const selection = this.selectedAutotile;
        this.painting = false;
        this.shapeStart = undefined;
        this.shapeEnd = undefined;
        this.shapeOutline?.clear();
        if (start === undefined || end === undefined || selection === undefined || this.publishedMap === undefined)
            return;

        const patch = TeapotTilePatch.parse({
            mapId: this.scene.getMapUrl(),
            expectedRevision: 0,
            regions: [createTerrainAutotileRegion(start.layer, start, end, selection.tiles)],
        });
        const source = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const edit = createFloorEdit(source, patch);
        if (edit === undefined) return;
        this.preview(patch, false);
        this.commitEdits([edit]);
    }

    private cancelShapeDrag(): void {
        this.painting = false;
        this.shapeStart = undefined;
        this.shapeEnd = undefined;
        this.shapeOutline?.clear();
    }

    private showShapeOutline(
        start: { layer: string; x: number; y: number },
        end: { layer: string; x: number; y: number },
    ): void {
        if (this.publishedMap === undefined) return;
        this.clearHoverPreview();
        const bounds = normalizeTerrainRectangle(start, end);
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const phaserLayer = this.scene.getGameMapFrontWrapper().findPhaserLayer(start.layer);
        const tileWidth = visibleMap.tilewidth ?? 32;
        const tileHeight = visibleMap.tileheight ?? 32;
        this.shapeOutline ??= this.scene.add.graphics();
        this.shapeOutline
            .clear()
            .fillStyle(0x5b6cff, 0.18)
            .fillRect(
                (phaserLayer?.x ?? 0) + bounds.x * tileWidth,
                (phaserLayer?.y ?? 0) + bounds.y * tileHeight,
                bounds.width * tileWidth,
                bounds.height * tileHeight,
            )
            .lineStyle(2, 0xffffff, 1)
            .strokeRect(
                (phaserLayer?.x ?? 0) + bounds.x * tileWidth,
                (phaserLayer?.y ?? 0) + bounds.y * tileHeight,
                bounds.width * tileWidth,
                bounds.height * tileHeight,
            )
            .setDepth((phaserLayer?.depth ?? 0) + 2);
        if (phaserLayer !== undefined) {
            this.shapeOutline.setScrollFactor(phaserLayer.scrollFactorX, phaserLayer.scrollFactorY);
        }
        this.scene.markDirty();
    }

    private finishPaintStroke(): void {
        this.painting = false;
        this.lastPaintedTileKey = undefined;
        if (this.activeEditGroup !== undefined && this.activeEditGroup.length > 0)
            this.commitEdits(this.activeEditGroup);
        this.activeEditGroup = undefined;
    }

    private commitEdits(edits: FloorEdit[]): void {
        const mutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: edits.flatMap((edit) => edit.forward.regions),
        };
        const inverseMutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: [...edits].reverse().flatMap((edit) => edit.backward.regions),
        };
        this.saving = true;
        this.setState({ status: "saving", error: undefined });
        this.mapEditorModeManager
            .executeCommand(new ModifyTerrainFrontCommand(this, mutation, inverseMutation))
            .catch((error) => this.rejectTerrainMutation(asError(error).message));
    }

    public applyTerrainMutation(mutation: TeapotTerrainMutation): void {
        const source = this.draftMap ?? this.draftBaseMap ?? this.publishedMap ?? structuredClone(this.scene.mapFile);
        const updated = applyTeapotTerrainMutation(source, mutation);
        this.draftMap = updated;
        this.scene.mapFile = structuredClone(updated);
        if (
            mutation.tilesetJson !== undefined &&
            !mutation.removeTileset &&
            this.pendingTilesetSelection !== undefined
        ) {
            const selection = this.pendingTilesetSelection;
            this.pendingTilesetSelection = undefined;
            this.activateEmbeddedSelection(selection, selection.firstGid, selection.tileCount);
        }
        if (mutation.regions.length > 0) {
            this.previewRegions = [...this.previewRegions, ...mutation.regions];
            this.updateChangedTileKeys(mutation.regions, updated);
            this.renderRegions(mutation.regions, updated);
        }
        this.saving = true;
        this.setState({ status: "saving", changedTiles: this.changedTileKeys.size, error: undefined });
    }

    public acknowledgeTerrainMutation(): void {
        const savedMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap ?? structuredClone(this.scene.mapFile);
        this.publishedMap = structuredClone(savedMap);
        this.scene.mapFile = structuredClone(savedMap);
        this.draftMap = undefined;
        this.draftBaseMap = undefined;
        this.previewRegions = [];
        this.changedTileKeys.clear();
        this.pendingTilesetSelection = undefined;
        this.saving = false;
        this.setState({ status: "saved", changedTiles: 0, error: undefined });
    }

    public rejectTerrainMutation(reason: string): void {
        const restoredMap = this.draftMap ?? this.publishedMap ?? structuredClone(this.scene.mapFile);
        this.publishedMap = structuredClone(restoredMap);
        this.scene.mapFile = structuredClone(restoredMap);
        this.draftMap = undefined;
        this.draftBaseMap = undefined;
        this.previewRegions = [];
        this.changedTileKeys.clear();
        this.pendingTilesetSelection = undefined;
        this.saving = false;
        this.setState({ status: "failed", changedTiles: 0, error: reason });
    }

    private showHoverPreview(tile: { layer: string; x: number; y: number }): void {
        if (this.publishedMap === undefined) return;
        this.clearHoverPreview();
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        this.hoveredTile = tile;
        const phaserLayer = this.scene.getGameMapFrontWrapper().findPhaserLayer(tile.layer);
        const tileWidth = visibleMap.tilewidth ?? 32;
        const tileHeight = visibleMap.tileheight ?? 32;
        const tileTexture = this.getTileTexture(this.selectedGid);
        if (tileTexture !== undefined) {
            this.hoverTilePreview = this.scene.add
                .image(
                    (phaserLayer?.x ?? 0) + (tile.x + 0.5) * tileWidth,
                    (phaserLayer?.y ?? 0) + (tile.y + 0.5) * tileHeight,
                    tileTexture.textureKey,
                    tileTexture.frame,
                )
                .setDisplaySize(tileWidth, tileHeight)
                .setAlpha(0.85)
                .setDepth((phaserLayer?.depth ?? 0) + 1.99);
            if (phaserLayer !== undefined) {
                this.hoverTilePreview.setScrollFactor(phaserLayer.scrollFactorX, phaserLayer.scrollFactorY);
            }
        }
        this.hoverOutline ??= this.scene.add.graphics();
        this.hoverOutline
            .clear()
            .fillStyle(0xffffff, 0.12)
            .fillRect(
                (phaserLayer?.x ?? 0) + tile.x * tileWidth,
                (phaserLayer?.y ?? 0) + tile.y * tileHeight,
                tileWidth,
                tileHeight,
            )
            .lineStyle(2, 0xffffff, 0.95)
            .strokeRect(
                (phaserLayer?.x ?? 0) + tile.x * tileWidth,
                (phaserLayer?.y ?? 0) + tile.y * tileHeight,
                tileWidth,
                tileHeight,
            )
            .setDepth((phaserLayer?.depth ?? 0) + 2);
        mapEditorFloorStateStore.update((state) => (state === undefined ? state : { ...state, hoveredTile: tile }));
        this.scene.markDirty();
    }

    private clearHoverPreview(): void {
        this.hoverTilePreview?.destroy();
        this.hoverTilePreview = undefined;
        if (this.hoveredTile !== undefined && this.publishedMap !== undefined) {
            const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
            const layer = findLayer(visibleMap.layers, this.hoveredTile.layer);
            if (layer?.type === "tilelayer" && Array.isArray(layer.data)) {
                const width = layer.width ?? visibleMap.width ?? 0;
                const gid = layer.data[this.hoveredTile.y * width + this.hoveredTile.x] ?? 0;
                this.renderTile(this.hoveredTile.layer, this.hoveredTile.x, this.hoveredTile.y, gid, visibleMap);
            }
        }
        this.hoveredTile = undefined;
        this.hoverOutline?.clear();
        mapEditorFloorStateStore.update((state) =>
            state === undefined || state.hoveredTile === undefined ? state : { ...state, hoveredTile: undefined },
        );
    }

    private updateChangedTileKeys(regions: readonly TeapotTileRegion[], draft: ITiledMap): void {
        if (this.publishedMap === undefined) return;
        for (const region of regions) {
            const publishedLayer = findLayer(this.publishedMap.layers, region.layer);
            const draftLayer = findLayer(draft.layers, region.layer);
            if (
                publishedLayer?.type !== "tilelayer" ||
                draftLayer?.type !== "tilelayer" ||
                !Array.isArray(publishedLayer.data) ||
                !Array.isArray(draftLayer.data)
            )
                continue;
            for (let y = 0; y < region.height; y += 1) {
                for (let x = 0; x < region.width; x += 1) {
                    const absoluteX = region.x + x;
                    const absoluteY = region.y + y;
                    const key = tileKey(region.layer, absoluteX, absoluteY);
                    const publishedGid = publishedLayer.data[absoluteY * publishedLayer.width + absoluteX] ?? 0;
                    const draftGid = draftLayer.data[absoluteY * draftLayer.width + absoluteX] ?? 0;
                    if (publishedGid === draftGid) this.changedTileKeys.delete(key);
                    else this.changedTileKeys.add(key);
                }
            }
        }
    }

    private addTileset(tileset: MapEditorFloorTilesetAsset, selection?: TilesetSelection): void {
        if (this.publishedMap === undefined) throw new Error("The current map is not loaded");
        if (this.saving) throw new Error("Wait for the current terrain edit to finish saving");
        const base = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const existingTileset = base.tilesets.find(
            (candidate) =>
                "image" in candidate &&
                typeof candidate.image === "string" &&
                resolveTilesetImage(candidate.image, this.scene.getMapUrl()) ===
                    resolveTilesetImage(tileset.url, this.scene.getMapUrl()),
        );
        if (existingTileset !== undefined) {
            if (selection !== undefined) {
                const firstGid = existingTileset.firstgid ?? 1;
                const tileCount =
                    "tilecount" in existingTileset && typeof existingTileset.tilecount === "number"
                        ? existingTileset.tilecount
                        : 1;
                this.activateEmbeddedSelection(selection, firstGid, tileCount);
            } else {
                this.setState({ status: "saved", error: undefined });
            }
            return;
        }
        const result = addTeapotEmbeddedTileset(base, {
            name: `teapot-${tileset.id}-${tileset.name}`,
            image: tileset.url,
            imageWidth: tileset.width,
            imageHeight: tileset.height,
        });
        const addedTileset = result.map.tilesets.find((candidate) => candidate.firstgid === result.firstGid);
        if (addedTileset === undefined) throw new Error("The terrain tileset could not be embedded");
        if (selection !== undefined) {
            this.pendingTilesetSelection = {
                ...selection,
                firstGid: result.firstGid,
                tileCount: result.tileCount,
            };
        }
        this.saving = true;
        this.setState({ status: "saving", changedTiles: 0, error: undefined });
        const mutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: [],
            tilesetJson: JSON.stringify(addedTileset),
        };
        const inverseMutation: TeapotTerrainMutation = { ...mutation, removeTileset: true };
        this.mapEditorModeManager
            .executeCommand(new ModifyTerrainFrontCommand(this, mutation, inverseMutation))
            .catch((error) => this.rejectTerrainMutation(asError(error).message));
        this.loadRuntimeTileset(result.firstGid, result.tileCount, tileset.url, tileset.id)
            .then(() => {
                if (this.draftMap !== undefined && this.previewRegions.length > 0) {
                    this.renderRegions(this.previewRegions, this.draftMap);
                }
            })
            .catch((error: unknown) => {
                this.setState({
                    status: "failed",
                    error: asError(error).message,
                });
            });
    }

    private activateEmbeddedSelection(selection: TilesetSelection, firstGid: number, tileCount: number): void {
        if (selection.kind === "tile") {
            this.selectEmbeddedTilesetTile(selection.layer, firstGid, tileCount, selection.tileId);
            return;
        }
        this.selectEmbeddedTilesetShape(selection.layer, selection.familyId, firstGid, tileCount, selection.autotile);
    }

    private selectEmbeddedTilesetTile(layer: string, firstGid: number, tileCount: number, tileId: number): void {
        const state = get(mapEditorFloorStateStore);
        if (state === undefined || !state.layers.some((candidate) => candidate.name === layer)) {
            throw new Error("Choose a terrain layer before selecting this tile");
        }
        if (!Number.isInteger(tileId) || tileId < 0 || tileId >= tileCount) {
            throw new Error("This terrain tile is outside its source atlas");
        }
        this.clearHoverPreview();
        this.cancelShapeDrag();
        this.selectedAutotile = undefined;
        const gid = firstGid + tileId;
        if (
            this.selectedLayer === layer &&
            this.selectedGid === gid &&
            get(mapEditorFloorStateStore)?.toolMode === "tile"
        ) {
            this.clearBrush();
            return;
        }
        this.selectedLayer = layer;
        this.selectedGid = gid;
        this.setState({
            selectedLayer: layer,
            selectedGid: this.selectedGid,
            toolMode: "tile",
            selectedTerrainFamilyId: undefined,
            error: undefined,
        });
        this.updateCursor();
    }

    private selectEmbeddedTilesetShape(
        layer: string,
        familyId: string,
        firstGid: number,
        tileCount: number,
        autotile: TerrainAutotileTiles,
    ): void {
        const state = get(mapEditorFloorStateStore);
        if (state === undefined || !state.layers.some((candidate) => candidate.name === layer)) {
            throw new Error("Choose a terrain layer before drawing a shape");
        }
        if (Object.values(autotile).some((tileId) => !Number.isInteger(tileId) || tileId < 0 || tileId >= tileCount)) {
            throw new Error("This terrain shape contains a tile outside its source atlas");
        }
        if (
            this.selectedLayer === layer &&
            this.selectedAutotile?.familyId === familyId &&
            state.toolMode === "shape"
        ) {
            this.clearBrush();
            return;
        }
        this.clearHoverPreview();
        this.cancelShapeDrag();
        this.selectedLayer = layer;
        this.selectedAutotile = { familyId, tiles: translateTerrainAutotileTiles(autotile, firstGid) };
        this.selectedGid = this.selectedAutotile.tiles.center;
        this.setState({
            selectedLayer: layer,
            selectedGid: this.selectedGid,
            toolMode: "shape",
            selectedTerrainFamilyId: familyId,
            error: undefined,
        });
        this.updateCursor();
    }

    private renderRegions(regions: readonly TeapotTileRegion[], map: ITiledMap): void {
        for (const region of regions) {
            const layer = findLayer(map.layers, region.layer);
            if (layer?.type !== "tilelayer" || !Array.isArray(layer.data)) continue;
            for (let y = 0; y < region.height; y += 1) {
                for (let x = 0; x < region.width; x += 1) {
                    const gid = layer.data[(region.y + y) * layer.width + region.x + x];
                    const absoluteX = region.x + x;
                    const absoluteY = region.y + y;
                    this.renderTile(region.layer, absoluteX, absoluteY, gid, map);
                }
            }
        }
    }

    private renderTile(layer: string, x: number, y: number, gid: number, map: ITiledMap): void {
        const overlayKey = tileKey(layer, x, y);
        this.tileOverlays.get(overlayKey)?.destroy();
        this.tileOverlays.delete(overlayKey);
        const phaserLayer = this.scene.getGameMapFrontWrapper().findPhaserLayer(layer);
        const runtimeTileset = this.runtimeTilesets.find(
            (candidate) => gid >= candidate.firstGid && gid < candidate.firstGid + candidate.tileCount,
        );
        if (runtimeTileset !== undefined) {
            this.renderOverlay(
                overlayKey,
                x,
                y,
                runtimeTileset.textureKey,
                gid - runtimeTileset.firstGid,
                map,
                phaserLayer,
            );
            return;
        }

        if (!tileLayerCanRenderGid(phaserLayer, gid)) {
            const tileTexture = this.getTileTexture(gid);
            if (tileTexture !== undefined) {
                this.renderOverlay(overlayKey, x, y, tileTexture.textureKey, tileTexture.frame, map, phaserLayer);
                return;
            }
        }
        this.scene.getGameMapFrontWrapper().putTile(gid === 0 ? null : gid, x, y, layer);
    }

    private getTileTexture(gid: number): { textureKey: string; frame: string | number } | undefined {
        const runtimeTileset = this.runtimeTilesets.find(
            (candidate) => gid >= candidate.firstGid && gid < candidate.firstGid + candidate.tileCount,
        );
        if (runtimeTileset !== undefined) {
            return { textureKey: runtimeTileset.textureKey, frame: gid - runtimeTileset.firstGid };
        }

        const tileset = findTilesetForGid(this.scene.Terrains, gid);
        const coordinates = tileset?.getTileTextureCoordinates(gid) as { x: number; y: number } | null | undefined;
        if (
            tileset?.image === null ||
            tileset?.image === undefined ||
            coordinates === null ||
            coordinates === undefined
        )
            return undefined;
        const frameName = `teapot-floor-tile-${gid}`;
        if (!tileset.image.has(frameName)) {
            tileset.image.add(frameName, 0, coordinates.x, coordinates.y, tileset.tileWidth, tileset.tileHeight);
        }
        return { textureKey: tileset.image.key, frame: frameName };
    }

    private renderOverlay(
        overlayKey: string,
        x: number,
        y: number,
        textureKey: string,
        frame: string | number,
        map: ITiledMap,
        phaserLayer: ReturnType<GameMapFrontWrapper["findPhaserLayer"]>,
    ): void {
        const tileWidth = map.tilewidth ?? 32;
        const tileHeight = map.tileheight ?? 32;
        const overlay = this.scene.add.image(
            (phaserLayer?.x ?? 0) + (x + 0.5) * tileWidth,
            (phaserLayer?.y ?? 0) + (y + 0.5) * tileHeight,
            textureKey,
            frame,
        );
        if (phaserLayer !== undefined) {
            overlay.setDepth(phaserLayer.depth + 0.01);
            overlay.setScrollFactor(phaserLayer.scrollFactorX, phaserLayer.scrollFactorY);
        }
        this.tileOverlays.set(overlayKey, overlay);
    }

    private async loadEmbeddedRuntimeTilesets(map: ITiledMap): Promise<void> {
        for (const tileset of map.tilesets) {
            if (
                !("image" in tileset) ||
                typeof tileset.image !== "string" ||
                (!tileset.image.includes("/teapot/tileset-assets/") &&
                    !BUILT_IN_TERRAIN_TILESET.matchesImage(tileset.image))
            )
                continue;
            const firstGid = tileset.firstgid ?? 1;
            const tileCount = "tilecount" in tileset && typeof tileset.tilecount === "number" ? tileset.tilecount : 1;
            // eslint-disable-next-line no-await-in-loop -- Phaser texture registration must remain deterministic.
            await this.loadRuntimeTileset(
                firstGid,
                tileCount,
                resolveTilesetImage(tileset.image, this.scene.getMapUrl()),
                `${firstGid}`,
            );
        }
    }

    private async loadRuntimeTileset(firstGid: number, tileCount: number, url: string, id: string): Promise<void> {
        if (this.runtimeTilesets.some((candidate) => candidate.firstGid === firstGid)) return;
        const textureKey = `teapot-tileset-${id.replace(/[^A-Za-z0-9_-]/g, "-")}-${firstGid}`;
        if (!this.scene.textures.exists(textureKey)) {
            const image = await loadImage(url);
            this.scene.textures.addSpriteSheet(textureKey, image, { frameWidth: 32, frameHeight: 32 });
        }
        this.runtimeTilesets.push({ firstGid, tileCount, textureKey });
    }

    private setState(update: Partial<MapEditorFloorState>): void {
        if (!this.active || this.publishedMap === undefined) return;
        const flatLayers = flattenLayers(this.publishedMap.layers);
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const tilesets = visibleMap.tilesets;
        const terrainGids = collectTerrainGids(visibleMap.layers);
        const minimumGid = tilesets[0]?.firstgid ?? 1;
        const maximumGid = Math.max(
            minimumGid,
            ...tilesets.map((tileset, index) => {
                const firstGid = tileset.firstgid ?? 1;
                const tileCount =
                    "tilecount" in tileset && typeof tileset.tilecount === "number" ? tileset.tilecount : 1;
                return (tilesets[index + 1]?.firstgid ?? firstGid + tileCount) - 1;
            }),
        );
        const mapWidth = this.publishedMap.width ?? 0;
        const mapHeight = this.publishedMap.height ?? 0;
        const editorLayers = flatLayers
            .filter((layer) => layer.type === "tilelayer" && Array.isArray(layer.data))
            .map((layer) => ({
                name: layer.name,
                width: layer.width ?? mapWidth,
                height: layer.height ?? mapHeight,
            }));
        const editorTilesets = tilesets.flatMap((tileset, index) => {
            if (!("image" in tileset) || typeof tileset.image !== "string") return [];
            const firstGid = tileset.firstgid ?? 1;
            const tileCount =
                "tilecount" in tileset && typeof tileset.tilecount === "number"
                    ? tileset.tilecount
                    : (tilesets[index + 1]?.firstgid ?? firstGid + 1) - firstGid;
            const columns = "columns" in tileset && typeof tileset.columns === "number" ? tileset.columns : 1;
            const resolvedImage = resolveTilesetImage(tileset.image, this.scene.getMapUrl());
            const tileGids = BUILT_IN_TERRAIN_TILESET.matchesImage(resolvedImage)
                ? getBuiltInTerrainTileIds().map((tileId) => firstGid + tileId)
                : getTerrainTilesetGids(firstGid, tileCount, terrainGids);
            if (tileGids.length === 0) return [];
            return [
                {
                    name: tileset.name ?? `Tileset ${index + 1}`,
                    image: resolvedImage,
                    firstGid,
                    columns,
                    rows: Math.ceil(tileCount / columns),
                    tileCount,
                    tileGids,
                },
            ];
        });
        if (this.selectedLayer !== "" && !editorLayers.some((layer) => layer.name === this.selectedLayer)) {
            this.selectedLayer = "";
        } else if (
            this.selectedLayer !== "" &&
            this.selectedGid !== 0 &&
            !editorTilesets.some((tileset) => tileset.tileGids.includes(this.selectedGid))
        ) {
            this.selectedGid = editorTilesets[0]?.firstGid ?? 0;
        }
        this.updateCursor();
        mapEditorFloorStateStore.update((previous) => ({
            ...previous,
            mapUrl: this.scene.getMapUrl(),
            layers: editorLayers,
            tilesets: editorTilesets,
            minimumGid,
            maximumGid,
            status: "idle",
            changedTiles: 0,
            selectedLayer: this.selectedLayer,
            selectedGid: this.selectedGid,
            toolMode: this.selectedAutotile === undefined ? "tile" : "shape",
            selectedTerrainFamilyId: this.selectedAutotile?.familyId,
            hoveredTile: this.hoveredTile,
            ...update,
        }));
    }
}

function flattenLayers(layers: ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => [layer, ...(layer.type === "group" ? flattenLayers(layer.layers) : [])]);
}

function findLayer(layers: ITiledMapLayer[], name: string): ITiledMapLayer | undefined {
    return flattenLayers(layers).find((layer) => layer.name === name);
}

function tileKey(layer: string, x: number, y: number): string {
    return `${layer}\u0000${x}\u0000${y}`;
}

function resolveTilesetImage(image: string, mapUrl: string): string {
    // Treat root-relative legacy atlas entries and newly persisted absolute entries alike.
    if (BUILT_IN_TERRAIN_TILESET.matchesImage(image)) {
        return BUILT_IN_TERRAIN_TILESET.image;
    }

    try {
        return new URL(image, mapUrl).href;
    } catch {
        return image;
    }
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("The tileset image could not be loaded for preview"));
        image.src = url;
    });
}
