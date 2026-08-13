import {
    addTeapotEmbeddedTileset,
    applyTeapotTerrainMutation,
    createSurfaceOverlayLayer,
    createWaterUnderlayLayer,
    ELEVATION_WORLD_LAYER,
    getElevationAt,
    getTileLayerGid,
    sculptElevation,
    surfaceOverlayCoverLayerName,
    surfaceOverlayLayerName,
    tileToWorldCenter,
    tileToWorldTopLeft,
    type TeapotTerrainMutation,
    TeapotTilePatch,
    type TeapotTileRegion,
    waterUnderlayCoverLayerName,
    waterUnderlayLayerName,
    worldToTileCoordinates,
    WIDE_ELEVATION_BRUSH_RADIUS,
    normalizeVegetationRectangle,
    planVegetation,
    type VegetationPlacementPlan,
} from "@workadventure/map-editor";
import type { EditMapCommandMessage } from "@workadventure/messages";
import type { ITiledMap, ITiledMapLayer, ITiledMapTileLayer } from "@workadventure/tiled-map-type-guard";
import * as Phaser from "phaser";
import type { GameObjects } from "phaser";
import { get, type Unsubscriber } from "svelte/store";
import { asError } from "catch-unknown";

import {
    createLiquidTerrainBrushRegions,
    createMergedTerrainAutotileRegions,
    createTerrainTileRegion,
    createWaterTerrainBrushRegions,
    createWaterTerrainRectangleRegions,
    normalizeTerrainRectangle,
    translateTerrainAutotileTiles,
    type TerrainAutotileTiles,
    type TerrainAutotileFamily,
} from "../../../../../common/Teapot/TerrainAutotile";
import {
    mapEditorFloorActionStore,
    mapEditorFloorStateStore,
    type MapEditorFloorAction,
    type MapEditorFloorState,
    type MapEditorFloorTilesetAsset,
} from "../../../../Stores/MapEditorFloorStore";
import { mapEditorVegetationStore } from "../../../../Stores/MapEditorVegetationStore";
import {
    BUILT_IN_TERRAIN_TILESET,
    getBuiltInTerrainAutotile,
    getBuiltInTerrainTileIds,
    getBuiltInWaterFillTileId,
} from "../../../../Services/BuiltInTerrainCatalog";
import { DEPTH_OVERLAY_INDEX } from "../../DepthIndexes";
import { TexturesHelper } from "../../../Helpers/TexturesHelper";
import {
    appendDefaultCollisionRegions,
    appendWaterCollisionRegions,
    findAuthoringPathBrushGid,
    getAuthoringPathOverlay,
    getAuthoringPathOverlayKind,
} from "../../GameMap/AuthoringCollision";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import { isElevatableTerrainGid } from "../../GameMap/ElevationEligibility";
import { ELEVATION_COMPOSITE_LAYER_DATA_KEY } from "../../GameMap/ElevationRenderer";
import type { GameScene } from "../../GameScene";
import { ModifyTerrainFrontCommand } from "../Commands/Terrain/ModifyTerrainFrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { hasPointerDragged } from "../PanGesture";
import { getEntityRenderDepth } from "../Entities/EntityRenderDepth";
import { collapseTileRegions, createFloorEdit, type FloorEdit } from "./FloorEditorHistory";
import {
    collectTerrainGids,
    findTopmostErasableLayer,
    getTerrainTilesetGids,
    resolveVegetationSelectionLayer,
} from "./FloorEditorCatalog";
import { findTilesetForGid, tileLayerCanRenderGid } from "./FloorEditorRendering";
import { MapEditorTool } from "./MapEditorTool";

type TilesetSelection =
    | {
          kind: "tile";
          layer: string;
          tileId: number;
          autotile?: TerrainAutotileTiles;
          waterFillTileId?: number;
      }
    | { kind: "shape"; layer: string; familyId: string; autotile: TerrainAutotileTiles };

type PendingTilesetSelection = TilesetSelection & { firstGid: number; tileCount: number };

type ShapeBrush =
    | { kind: "autotile"; tiles: TerrainAutotileTiles }
    | { kind: "water"; gid: number }
    | { kind: "tile"; gid: number };

const AUTHORING_PATH_OVERLAY_COLORS = {
    collision: { base: 0x4d9dff, checks: 0x84bdff },
    exit: { base: 0xf59e0b, checks: 0xfcd34d },
    start: { base: 0x22c55e, checks: 0x86efac },
} as const;

const ELEVATION_REPEAT_INTERVAL_MS = 120;

export const OCCUPIED_TILE_DELETION_ERROR = "A tile beneath an avatar cannot be deleted.";

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
    private pathOverlay: GameObjects.Graphics | undefined;
    private readonly changedTileKeys = new Set<string>();
    private selectedLayer = "";
    private selectedGid = 0;
    private selectedTilesetFirstGid = 0;
    private surfaceStrokeLayerName: string | undefined;
    private surfaceStrokePlacementId: string | undefined;
    private pendingTilesetSelection: PendingTilesetSelection | undefined;
    private selectedAutotile: { familyId: string; tiles: TerrainAutotileTiles } | undefined;
    private selectedAutotileForTileBrush: TerrainAutotileTiles | undefined;
    private selectedWaterFillGid: number | undefined;
    private shapeStart: { layer: string; x: number; y: number } | undefined;
    private shapeEnd: { layer: string; x: number; y: number } | undefined;
    private shapeBrush: ShapeBrush | undefined;
    private strokeAutotile: TerrainAutotileTiles | undefined;
    private strokeWaterFillGid: number | undefined;
    private liquidStrokeAutotile: TerrainAutotileTiles | undefined;
    private liquidStrokeSeed: { layer: string; x: number; y: number } | undefined;
    private liquidStrokePrevious: { layer: string; x: number; y: number } | undefined;
    private shapeOutline: GameObjects.Graphics | undefined;
    private vegetationSelectionStart: { layer: string; x: number; y: number } | undefined;
    private vegetationGhosts: GameObjects.Sprite[] = [];
    private vegetationGhostGeneration = 0;
    private vegetationStateUnsubscriber: Unsubscriber | undefined;
    private vegetationSelectionActive = false;
    private hoveredTile: { layer: string; x: number; y: number } | undefined;
    private hoverTilePreview: GameObjects.Image | undefined;
    private hoverOutline: GameObjects.Graphics | undefined;
    private painting = false;
    private panCandidate = false;
    private panning = false;
    private lastPaintedTileKey: string | undefined;
    private activeEditGroup: FloorEdit[] | undefined;
    private elevationPointerTile: { layer: string; x: number; y: number } | undefined;
    private elevationDirection: 1 | -1 = 1;
    private elevationBrushRadius = 0;
    private nextElevationSculptAt = 0;
    private readonly shiftKey: Phaser.Input.Keyboard.Key | undefined;
    private readonly pointerMoveEventHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer);
    private readonly pointerDownEventHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer);
    private readonly pointerUpEventHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer);
    private readonly pointerOutEventHandler = (pointer: Phaser.Input.Pointer) => this.handlePointerOut(pointer);

    constructor(mapEditorModeManager: MapEditorModeManager) {
        super();
        this.mapEditorModeManager = mapEditorModeManager;
        this.scene = this.mapEditorModeManager.getScene();
        this.shiftKey = this.scene.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    }

    public update(time: number, _dt: number): void {
        if (
            !this.painting ||
            this.elevationPointerTile === undefined ||
            time < this.nextElevationSculptAt ||
            get(mapEditorFloorStateStore)?.toolMode !== "elevation"
        ) {
            return;
        }
        this.paintElevation(this.elevationPointerTile);
        this.nextElevationSculptAt = time + ELEVATION_REPEAT_INTERVAL_MS;
    }

    public clear(): void {
        this.clearHoverPreview();
        this.clearPathOverlay();
        this.unbindPointerEvents();
        this.active = false;
        this.hoverOutline?.destroy();
        this.hoverOutline = undefined;
        this.shapeOutline?.destroy();
        this.shapeOutline = undefined;
        this.clearVegetationGhosts();
        this.vegetationSelectionStart = undefined;
        this.vegetationStateUnsubscriber?.();
        this.vegetationStateUnsubscriber = undefined;
        mapEditorFloorStateStore.set(undefined);
    }

    public activate(): void {
        this.active = true;
        this.saving = false;
        this.pendingTilesetSelection = undefined;
        this.selectedAutotile = undefined;
        this.selectedAutotileForTileBrush = undefined;
        this.selectedWaterFillGid = undefined;
        this.strokeAutotile = undefined;
        this.strokeWaterFillGid = undefined;
        this.liquidStrokeAutotile = undefined;
        this.liquidStrokeSeed = undefined;
        this.liquidStrokePrevious = undefined;
        this.shapeStart = undefined;
        this.shapeEnd = undefined;
        this.shapeBrush = undefined;
        this.publishedMap = structuredClone(this.scene.mapFile);
        this.draftMap = undefined;
        this.draftBaseMap = undefined;
        this.previewRegions = [];
        this.changedTileKeys.clear();
        this.scene.getGameMapFrontWrapper().getEntitiesManager().makeAllEntitiesNonInteractive();
        this.bindPointerEvents();
        this.installActionSubscription();
        this.vegetationStateUnsubscriber = mapEditorVegetationStore.subscribe((state) => {
            this.vegetationSelectionActive = state.selectionMode === true && state.selectedPreset !== undefined;
            if (!this.vegetationSelectionActive) this.vegetationSelectionStart = undefined;
            this.renderVegetationGhosts(state.preview);
            this.updateCursor();
        });
        this.setState({ status: "idle", error: undefined });
        this.updateCursor();
        this.refreshPathOverlay();
        this.loadEmbeddedRuntimeTilesets(this.publishedMap).catch(() => undefined);
    }

    public destroy(): void {
        this.clearHoverPreview();
        this.clearPathOverlay();
        this.unbindPointerEvents();
        this.active = false;
        this.hoverOutline?.destroy();
        this.hoverOutline = undefined;
        this.shapeOutline?.destroy();
        this.shapeOutline = undefined;
        this.actionUnsubscriber?.();
        this.actionUnsubscriber = undefined;
        this.vegetationStateUnsubscriber?.();
        this.vegetationStateUnsubscriber = undefined;
        this.clearVegetationGhosts();
    }

    public subscribeToGameMapFrontWrapperEvents(_gameMapFrontWrapper: GameMapFrontWrapper): void {}

    public handleKeyDownEvent(_event: KeyboardEvent): void {}

    public cancelCurrentAction(): boolean {
        if (this.selectedLayer === "" && this.shapeStart === undefined && !this.painting) {
            return false;
        }
        if (this.shapeStart !== undefined) this.cancelShapeDrag();
        else this.finishPaintStroke();
        this.clearBrush();
        return true;
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
            layerJson: message.modifyTerrainMessage.layerJson || undefined,
            removeLayer: message.modifyTerrainMessage.removeLayer,
            beforeLayer: message.modifyTerrainMessage.beforeLayer || undefined,
            elevationUpdates: message.modifyTerrainMessage.elevationUpdates,
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
                if (this.preview(patch, false) && edit !== undefined) this.commitEdits([edit]);
                return Promise.resolve();
            }
            if (action.type === "select-brush") {
                this.selectBrush(action.layer, action.gid);
                return Promise.resolve();
            }
            if (action.type === "select-elevation") {
                this.selectElevation(action.layer);
                return Promise.resolve();
            }
            if (action.type === "select-library-brush") {
                this.addTileset(action.tileset, {
                    kind: "tile",
                    layer: action.layer,
                    tileId: action.tileId,
                    autotile: getBuiltInTerrainAutotile(action.tileId),
                    waterFillTileId: getBuiltInWaterFillTileId(action.tileId),
                });
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

    private preview(patch: TeapotTerrainMutation | TeapotTilePatch, recordHistory = true): boolean {
        if (this.publishedMap === undefined) throw new Error("The current map is not loaded");
        if (patch.mapId !== this.scene.getMapUrl()) throw new Error("This patch belongs to a different map");
        const mutation: TeapotTerrainMutation = {
            mapId: patch.mapId,
            regions: patch.regions,
            ...("layerJson" in patch
                ? {
                      layerJson: patch.layerJson,
                      removeLayer: patch.removeLayer,
                      beforeLayer: patch.beforeLayer,
                  }
                : {}),
            ...("elevationUpdates" in patch && patch.elevationUpdates !== undefined
                ? { elevationUpdates: patch.elevationUpdates }
                : {}),
        };
        if (!this.canApplyTerrainMutation(mutation)) {
            this.setState({ status: "failed", error: OCCUPIED_TILE_DELETION_ERROR });
            return false;
        }
        this.clearHoverPreview();
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const edit = recordHistory ? createFloorEdit(visibleMap, mutation) : undefined;
        const updated = applyTeapotTerrainMutation(visibleMap, mutation);
        this.draftMap = updated;
        this.previewRegions = [...this.previewRegions, ...patch.regions];
        this.updateChangedTileKeys(patch.regions, updated);
        this.renderRegions(patch.regions, updated);
        this.scene.getElevationRenderer().render(updated);
        if (edit !== undefined && this.activeEditGroup !== undefined) this.activeEditGroup.push(edit);
        this.setState({ status: "saving", changedTiles: this.changedTileKeys.size, error: undefined });
        return true;
    }

    private selectBrush(layer: string, gid: number): void {
        const state = get(mapEditorFloorStateStore);
        if (layer === "") {
            this.clearBrush();
            return;
        }
        if (state === undefined || !state.layers.some((candidate) => candidate.name === layer)) return;
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        let selectedGid = gid;
        if (gid !== 0 && visibleMap !== undefined && getAuthoringPathOverlay(visibleMap, layer) !== undefined) {
            const pathBrushGid =
                findAuthoringPathBrushGid(visibleMap, layer) ??
                state.tilesets.flatMap((tileset) => tileset.tileGids).find((candidate) => candidate !== 0);
            if (pathBrushGid === undefined) {
                this.setState({
                    status: "failed",
                    error: "This map has no marker tile available for this terrain mode.",
                });
                return;
            }
            selectedGid = pathBrushGid;
        } else if (gid !== 0 && !state.tilesets.some((tileset) => tileset.tileGids.includes(gid))) {
            return;
        }
        if (this.selectedLayer === layer && this.selectedGid === selectedGid && state.toolMode === "tile") {
            if (visibleMap !== undefined && getAuthoringPathOverlay(visibleMap, layer) !== undefined) return;
            this.clearBrush();
            return;
        }
        this.clearHoverPreview();
        this.cancelShapeDrag();
        this.selectedAutotile = undefined;
        this.selectedWaterFillGid = this.getTileBrushWaterFillGid(state, selectedGid);
        if (this.selectedWaterFillGid !== undefined) selectedGid = this.selectedWaterFillGid;
        this.selectedAutotileForTileBrush = this.getTileBrushAutotile(state, selectedGid);
        this.selectedLayer = layer;
        this.selectedGid = selectedGid;
        const selectedTileset = state.tilesets.find(
            (tileset) => selectedGid >= tileset.firstGid && selectedGid < tileset.firstGid + tileset.tileCount,
        );
        this.selectedTilesetFirstGid =
            selectedGid !== 0 && this.selectedWaterFillGid === undefined && selectedTileset !== undefined
                ? selectedTileset.firstGid
                : 0;
        this.setState({
            selectedLayer: layer,
            selectedGid,
            toolMode: "tile",
            selectedTerrainFamilyId: undefined,
            error: undefined,
        });
        this.updateCursor();
        this.refreshPathOverlay();
    }

    private clearBrush(): void {
        this.clearHoverPreview();
        this.cancelShapeDrag();
        this.selectedAutotile = undefined;
        this.selectedAutotileForTileBrush = undefined;
        this.selectedWaterFillGid = undefined;
        this.selectedLayer = "";
        this.selectedTilesetFirstGid = 0;
        this.setState({
            selectedLayer: this.selectedLayer,
            selectedGid: this.selectedGid,
            toolMode: "tile",
            selectedTerrainFamilyId: undefined,
            error: undefined,
        });
        this.updateCursor();
        this.clearPathOverlay();
    }

    private selectElevation(layer: string): void {
        const state = get(mapEditorFloorStateStore);
        if (state === undefined || !state.layers.some((candidate) => candidate.name === layer)) return;
        this.clearHoverPreview();
        this.cancelShapeDrag();
        this.selectedAutotile = undefined;
        this.selectedAutotileForTileBrush = undefined;
        this.selectedWaterFillGid = undefined;
        this.selectedLayer = layer;
        this.selectedGid = 1;
        this.setState({
            selectedLayer: layer,
            selectedGid: this.selectedGid,
            toolMode: "elevation",
            selectedTerrainFamilyId: undefined,
            error: undefined,
        });
        this.updateCursor();
        this.refreshPathOverlay();
        this.scene.getElevationRenderer().render(this.draftMap ?? this.draftBaseMap ?? this.publishedMap);
    }

    private getTileBrushAutotile(state: MapEditorFloorState, gid: number): TerrainAutotileTiles | undefined {
        const tileset = state.tilesets.find(
            (candidate) =>
                gid >= candidate.firstGid &&
                gid < candidate.firstGid + candidate.tileCount &&
                BUILT_IN_TERRAIN_TILESET.matchesImage(candidate.image),
        );
        if (tileset === undefined) return undefined;
        const autotile = getBuiltInTerrainAutotile(gid - tileset.firstGid);
        return autotile === undefined ? undefined : translateTerrainAutotileTiles(autotile, tileset.firstGid);
    }

    private getTileBrushWaterFillGid(state: MapEditorFloorState, gid: number): number | undefined {
        const tileset = state.tilesets.find(
            (candidate) =>
                gid >= candidate.firstGid &&
                gid < candidate.firstGid + candidate.tileCount &&
                BUILT_IN_TERRAIN_TILESET.matchesImage(candidate.image),
        );
        if (tileset === undefined) return undefined;
        const fillTileId = getBuiltInWaterFillTileId(gid - tileset.firstGid);
        return fillTileId === undefined ? undefined : tileset.firstGid + fillTileId;
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
        const tile =
            this.vegetationSelectionActive || this.vegetationSelectionStart !== undefined
                ? this.getVegetationTileAtPointer(pointer)
                : this.getTileAtPointer(pointer);
        if (tile === undefined) {
            if (this.shapeStart === undefined) this.clearHoverPreview();
            return;
        }
        if (this.vegetationSelectionStart !== undefined && pointer.leftButtonDown()) {
            this.showShapeOutline(this.vegetationSelectionStart, tile);
            return;
        }
        if (this.shapeStart !== undefined && this.shapeBrush !== undefined && pointer.leftButtonDown()) {
            this.shapeEnd = tile;
            this.showShapeOutline(this.shapeStart, tile);
            return;
        }
        const elevationMode = get(mapEditorFloorStateStore)?.toolMode === "elevation";
        if (elevationMode) {
            this.elevationDirection = getElevationDirection(pointer);
            this.elevationBrushRadius = isShiftDown(pointer, this.shiftKey) ? WIDE_ELEVATION_BRUSH_RADIUS : 0;
            if (this.painting && pointer.leftButtonDown()) this.elevationPointerTile = tile;
        }
        const key = tileKey(tile.layer, tile.x, tile.y);
        if (
            this.hoveredTile === undefined ||
            tileKey(this.hoveredTile.layer, this.hoveredTile.x, this.hoveredTile.y) !== key
        ) {
            this.showHoverPreview(tile);
        }
        if (this.painting && pointer.leftButtonDown() && key !== this.lastPaintedTileKey) {
            if (elevationMode) {
                this.paintElevation(tile);
                this.nextElevationSculptAt = this.scene.time.now + ELEVATION_REPEAT_INTERVAL_MS;
            } else {
                this.paintTile(tile);
            }
        }
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        if (!pointer.leftButtonDown()) return;
        if (this.vegetationSelectionActive) {
            const tile = this.getVegetationTileAtPointer(pointer);
            if (tile === undefined) return;
            this.vegetationSelectionStart = tile;
            this.showShapeOutline(tile, tile);
            return;
        }
        if (this.selectedLayer === "") {
            pointer.motionFactor = 0.35;
            this.panCandidate = true;
            return;
        }
        if (this.selectedTilesetFirstGid > 0) {
            this.surfaceStrokePlacementId = crypto.randomUUID();
            this.surfaceStrokeLayerName = surfaceOverlayLayerName(
                this.selectedLayer,
                this.selectedTilesetFirstGid,
                this.surfaceStrokePlacementId,
            );
        }
        const tile = this.getTileAtPointer(pointer);
        if (tile === undefined) return;
        if (get(mapEditorFloorStateStore)?.toolMode === "elevation") {
            this.painting = true;
            this.lastPaintedTileKey = undefined;
            this.activeEditGroup = [];
            this.elevationPointerTile = tile;
            this.elevationDirection = getElevationDirection(pointer);
            this.elevationBrushRadius = isShiftDown(pointer, this.shiftKey) ? WIDE_ELEVATION_BRUSH_RADIUS : 0;
            this.paintElevation(tile);
            this.nextElevationSculptAt = this.scene.time.now + ELEVATION_REPEAT_INTERVAL_MS;
            return;
        }
        const shapeBrush =
            this.selectedAutotile?.familyId === "water"
                ? { kind: "water" as const, gid: this.selectedAutotile.tiles.center }
                : this.selectedAutotile === undefined
                  ? this.shiftKey?.isDown
                      ? { kind: "tile" as const, gid: this.selectedGid }
                      : undefined
                  : { kind: "autotile" as const, tiles: this.selectedAutotile.tiles };
        if (shapeBrush !== undefined) {
            this.painting = true;
            this.shapeStart = tile;
            this.shapeEnd = tile;
            this.shapeBrush = shapeBrush;
            this.showShapeOutline(tile, tile);
            return;
        }
        this.painting = true;
        this.lastPaintedTileKey = undefined;
        this.activeEditGroup = [];
        this.strokeWaterFillGid = this.selectedWaterFillGid;
        this.strokeAutotile = this.strokeWaterFillGid === undefined ? this.selectedAutotileForTileBrush : undefined;
        this.liquidStrokeAutotile = this.strokeAutotile;
        this.liquidStrokeSeed =
            this.liquidStrokeAutotile === undefined && this.strokeWaterFillGid === undefined ? undefined : tile;
        this.liquidStrokePrevious = this.liquidStrokeSeed;
        this.paintTile(tile);
    }

    private handlePointerUp(pointer: Phaser.Input.Pointer): void {
        this.stopPanning(pointer);
        if (this.vegetationSelectionStart !== undefined) {
            const end = this.getVegetationTileAtPointer(pointer);
            if (end !== undefined) this.finishVegetationSelection(end);
            return;
        }
        if (this.shapeStart !== undefined && this.shapeEnd !== undefined && this.shapeBrush !== undefined) {
            this.finishShapeDrag();
            this.surfaceStrokeLayerName = undefined;
            this.surfaceStrokePlacementId = undefined;
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
        this.scene.input.setDefaultCursor(
            this.vegetationSelectionActive || this.selectedLayer !== "" ? "crosshair" : "auto",
        );
    }

    private getVegetationTileAtPointer(
        pointer: Phaser.Input.Pointer,
    ): { layer: string; x: number; y: number } | undefined {
        if (this.publishedMap === undefined || this.pendingTilesetSelection !== undefined) return undefined;
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const layerName = resolveVegetationSelectionLayer(this.selectedLayer, visibleMap.layers);
        if (layerName === "") return undefined;
        const coordinates =
            this.scene.getElevationRenderer().getTileCoordinatesAtWorldPoint(pointer.worldX, pointer.worldY) ??
            worldToTileCoordinates(visibleMap, pointer.worldX, pointer.worldY);
        return { layer: layerName, ...coordinates };
    }

    private getTileAtPointer(pointer: Phaser.Input.Pointer): { layer: string; x: number; y: number } | undefined {
        if (this.publishedMap === undefined || this.selectedLayer === "" || this.pendingTilesetSelection !== undefined)
            return undefined;
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const coordinates =
            this.scene.getElevationRenderer().getTileCoordinatesAtWorldPoint(pointer.worldX, pointer.worldY) ??
            worldToTileCoordinates(visibleMap, pointer.worldX, pointer.worldY);
        const elevationMode = get(mapEditorFloorStateStore)?.toolMode === "elevation";
        const surfaceLayerName = this.getSurfaceOverlayLayerName();
        const targetLayer = elevationMode
            ? (findTopmostErasableLayer(visibleMap.layers, coordinates.x, coordinates.y) ?? this.selectedLayer)
            : this.selectedGid === 0 && getAuthoringPathOverlayKind(this.selectedLayer) === undefined
              ? (findTopmostErasableLayer(visibleMap.layers, coordinates.x, coordinates.y) ?? this.selectedLayer)
              : (surfaceLayerName ?? this.selectedLayer);
        const layer = findLayer(visibleMap.layers, targetLayer);
        if (layer?.type !== "tilelayer" && targetLayer !== surfaceLayerName) return undefined;
        return { layer: targetLayer, ...coordinates };
    }

    private paintTile(tile: { layer: string; x: number; y: number }): void {
        if (this.publishedMap === undefined) return;
        const key = tileKey(tile.layer, tile.x, tile.y);
        this.lastPaintedTileKey = key;
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const terrainLayer = findLayer(visibleMap.layers, tile.layer);
        const previous = this.liquidStrokePrevious ?? tile;
        if (this.strokeWaterFillGid !== undefined && terrainLayer?.type === "tilelayer") {
            this.paintWaterTile(visibleMap, terrainLayer, previous, tile, this.strokeWaterFillGid);
            return;
        }
        const existingTiles =
            terrainLayer?.type === "tilelayer" && this.strokeAutotile !== undefined
                ? collectTerrainTiles(terrainLayer, previous, tile, this.liquidStrokeAutotile === undefined ? 2 : 3)
                : [];
        const terrainRegions =
            this.liquidStrokeAutotile !== undefined && this.liquidStrokeSeed !== undefined
                ? createLiquidTerrainBrushRegions(
                      tile.layer,
                      this.liquidStrokeSeed,
                      previous,
                      tile,
                      this.liquidStrokeAutotile,
                      existingTiles,
                      getMatchingTerrainFamilyGids(visibleMap, this.selectedGid),
                  )
                : this.strokeAutotile === undefined
                  ? [{ ...tile, width: 1, height: 1, gids: [this.selectedGid] }]
                  : createMergedTerrainAutotileRegions(
                        tile.layer,
                        tile,
                        tile,
                        this.strokeAutotile,
                        existingTiles,
                        getMatchingTerrainFamilyGids(visibleMap, this.selectedGid),
                    );
        const rawRegions = appendDefaultCollisionRegions(visibleMap, terrainRegions);
        if (rawRegions.length === 0) {
            if (this.liquidStrokeAutotile !== undefined) this.liquidStrokePrevious = tile;
            this.showHoverPreview(tile);
            return;
        }
        const addedLayer = this.getMissingSurfaceOverlayLayer(visibleMap, tile.layer);
        const applied = this.preview({
            mapId: this.scene.getMapUrl(),
            regions: rawRegions,
            ...(addedLayer === undefined ? {} : { layerJson: JSON.stringify(addedLayer) }),
        });
        if (applied && this.liquidStrokeAutotile !== undefined) this.liquidStrokePrevious = tile;
        this.showHoverPreview(tile);
    }

    private paintElevation(tile: { layer: string; x: number; y: number }): void {
        const source = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        if (source === undefined) return;
        const layer = findLayer(source.layers, tile.layer);
        if (layer?.type !== "tilelayer" || !isElevatableTerrainGid(source, getTileLayerGid(layer, tile.x, tile.y))) {
            this.setState({ error: "Elevation is available only on outdoor dirt and natural terrain." });
            this.showHoverPreview(tile);
            return;
        }
        const elevationUpdates = sculptElevation(source, ELEVATION_WORLD_LAYER, tile.x, tile.y, {
            direction: this.elevationDirection,
            radius: this.elevationBrushRadius,
        });
        this.lastPaintedTileKey = tileKey(ELEVATION_WORLD_LAYER, tile.x, tile.y);
        if (elevationUpdates.length === 0) {
            this.showHoverPreview(tile);
            return;
        }
        const mutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: [],
            elevationUpdates,
        };
        this.preview(mutation);
        this.showHoverPreview(tile);
    }

    private paintWaterTile(
        visibleMap: ITiledMap,
        coverLayer: ITiledMapTileLayer,
        previous: { x: number; y: number },
        tile: { layer: string; x: number; y: number },
        waterGid: number,
    ): void {
        const waterLayerName = waterUnderlayLayerName(tile.layer);
        const waterLayer = findLayer(visibleMap.layers, waterLayerName);
        const composition = createWaterTerrainBrushRegions(
            tile.layer,
            waterLayerName,
            previous,
            tile,
            waterGid,
            collectTerrainTiles(coverLayer, previous, tile, 3),
            waterLayer?.type === "tilelayer" ? collectTerrainTiles(waterLayer, previous, tile, 3) : [],
            getTerrainAutotileFamilies(visibleMap),
        );
        const regions = appendWaterCollisionRegions(visibleMap, composition.regions, composition.visibleWater);
        const addedLayer = waterLayer === undefined ? createWaterUnderlayLayer(visibleMap, tile.layer) : undefined;
        if (regions.length === 0 && addedLayer === undefined) {
            this.liquidStrokePrevious = tile;
            this.showHoverPreview(tile);
            return;
        }
        const mutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions,
            ...(addedLayer === undefined
                ? {}
                : { layerJson: JSON.stringify(addedLayer), beforeLayer: tile.layer, removeLayer: false }),
        };
        if (this.preview(mutation)) this.liquidStrokePrevious = tile;
        this.showHoverPreview(tile);
    }

    private finishShapeDrag(): void {
        const start = this.shapeStart;
        const end = this.shapeEnd;
        const brush = this.shapeBrush;
        this.painting = false;
        this.shapeStart = undefined;
        this.shapeEnd = undefined;
        this.shapeBrush = undefined;
        this.shapeOutline?.clear();
        if (start === undefined || end === undefined || brush === undefined || this.publishedMap === undefined) return;

        const source = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const terrainLayer = findLayer(source.layers, start.layer);
        if (brush.kind === "water" && terrainLayer?.type === "tilelayer") {
            const waterLayerName = waterUnderlayLayerName(start.layer);
            const waterLayer = findLayer(source.layers, waterLayerName);
            const composition = createWaterTerrainRectangleRegions(
                start.layer,
                waterLayerName,
                start,
                end,
                brush.gid,
                collectTerrainTiles(terrainLayer, start, end, 2),
                waterLayer?.type === "tilelayer" ? collectTerrainTiles(waterLayer, start, end, 2) : [],
                getTerrainAutotileFamilies(source),
            );
            const regions = appendWaterCollisionRegions(source, composition.regions, composition.visibleWater);
            const addedLayer = waterLayer === undefined ? createWaterUnderlayLayer(source, start.layer) : undefined;
            const mutation: TeapotTerrainMutation = {
                mapId: this.scene.getMapUrl(),
                regions,
                ...(addedLayer === undefined
                    ? {}
                    : { layerJson: JSON.stringify(addedLayer), beforeLayer: start.layer, removeLayer: false }),
            };
            const edit = createFloorEdit(source, mutation);
            if (edit !== undefined && this.preview(mutation, false)) this.commitEdits([edit]);
            return;
        }
        const existingTiles =
            terrainLayer?.type === "tilelayer" && brush.kind === "autotile"
                ? collectTerrainTiles(terrainLayer, start, end, 2)
                : [];
        const terrainRegions =
            brush.kind === "autotile"
                ? createMergedTerrainAutotileRegions(
                      start.layer,
                      start,
                      end,
                      brush.tiles,
                      existingTiles,
                      getMatchingTerrainFamilyGids(source, brush.tiles.center),
                  )
                : [createTerrainTileRegion(start.layer, start, end, brush.gid)];
        const rawRegions = appendDefaultCollisionRegions(source, terrainRegions);
        if (rawRegions.length === 0) return;
        const addedLayer = this.getMissingSurfaceOverlayLayer(source, start.layer);
        const patch: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: rawRegions,
            ...(addedLayer === undefined ? {} : { layerJson: JSON.stringify(addedLayer) }),
        };
        const edit = createFloorEdit(source, patch);
        if (edit === undefined) return;
        if (this.preview(patch, false)) this.commitEdits([edit]);
    }

    private cancelShapeDrag(): void {
        this.painting = false;
        this.shapeStart = undefined;
        this.shapeEnd = undefined;
        this.shapeBrush = undefined;
        this.surfaceStrokeLayerName = undefined;
        this.surfaceStrokePlacementId = undefined;
        this.shapeOutline?.clear();
    }

    private finishVegetationSelection(end: { layer: string; x: number; y: number }): void {
        const start = this.vegetationSelectionStart;
        this.vegetationSelectionStart = undefined;
        this.shapeOutline?.clear();
        if (start === undefined) return;
        const state = get(mapEditorVegetationStore);
        if (state.selectedPreset === undefined) return;
        const prefabs = get(this.scene.getEntitiesCollectionsManager().getEntitiesPrefabsStore());
        const byReference = new Map(prefabs.map((prefab) => [`${prefab.collectionName}\0${prefab.id}`, prefab]));
        const selectedSpecies = state.selectedPreset.species.map(({ prefabRef }) => {
            const prefab = byReference.get(`${prefabRef.collectionName}\0${prefabRef.id}`);
            if (prefab === undefined) throw new Error(`Vegetation prefab ${prefabRef.id} is unavailable`);
            return {
                prefabRef,
                footprintWidth: Math.max(1, Math.ceil(prefab.defaultSizeInTiles ?? 1)),
                footprintHeight: Math.max(1, Math.ceil(prefab.defaultHeightInTiles ?? 1)),
                blocking: prefab.collisionGrid?.some((row) => row.some((cell) => cell !== 0)) ?? false,
            };
        });
        try {
            const preview = planVegetation({
                preset: state.selectedPreset,
                seed: crypto.randomUUID(),
                rectangle: normalizeVegetationRectangle({
                    startX: start.x,
                    startY: start.y,
                    endX: end.x,
                    endY: end.y,
                }),
                species: selectedSpecies,
                tileWidth: this.publishedMap?.tilewidth ?? 32,
                tileHeight: this.publishedMap?.tileheight ?? 32,
            });
            mapEditorVegetationStore.set({
                status: "preview",
                selectedPreset: state.selectedPreset,
                preview,
                selectionMode: false,
            });
        } catch (error) {
            mapEditorVegetationStore.set({
                ...state,
                status: "selecting",
                error: error instanceof Error ? error.message : "The vegetation preview could not be created.",
            });
        }
    }

    private renderVegetationGhosts(preview: VegetationPlacementPlan | undefined): void {
        this.clearVegetationGhosts();
        if (preview === undefined) return;
        const generation = this.vegetationGhostGeneration;
        const prefabs = get(this.scene.getEntitiesCollectionsManager().getEntitiesPrefabsStore());
        const prefabsByReference = new Map(
            prefabs.map((prefab) => [`${prefab.collectionName}\0${prefab.id}`, prefab] as const),
        );
        const textureLoads = new Map<string, Promise<void>>();
        for (const placement of preview.placements) {
            const prefab = prefabsByReference.get(`${placement.prefabRef.collectionName}\0${placement.prefabRef.id}`);
            if (prefab === undefined) continue;
            let textureLoad = textureLoads.get(prefab.imagePath);
            if (textureLoad === undefined) {
                textureLoad = TexturesHelper.loadEntityTexture(this.scene, prefab, prefab.imagePath);
                textureLoads.set(prefab.imagePath, textureLoad);
            }
            textureLoad
                .then(() => {
                    if (generation !== this.vegetationGhostGeneration) return;
                    const sprite = this.scene.add.sprite(placement.x, placement.y, prefab.imagePath).setOrigin(0);
                    sprite.setDisplaySize(placement.width, placement.height);
                    sprite.setAlpha(0.7);
                    sprite.setDepth(getEntityRenderDepth(placement.y, placement.height, prefab));
                    TexturesHelper.playEntityAnimation(sprite, prefab);
                    this.scene.getGameRenderLayers().addWorldObject(sprite);
                    this.vegetationGhosts.push(sprite);
                    this.scene.markDirty();
                })
                .catch((error) => console.error("Could not load vegetation preview", error));
        }
    }

    private clearVegetationGhosts(): void {
        this.vegetationGhostGeneration += 1;
        for (const ghost of this.vegetationGhosts) ghost.destroy();
        this.vegetationGhosts = [];
        this.scene.markDirty();
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
        const topLeft = tileToWorldTopLeft(visibleMap, bounds.x, bounds.y);
        this.shapeOutline ??= this.scene.add.graphics();
        this.shapeOutline
            .clear()
            .fillStyle(0x5b6cff, 0.18)
            .fillRect(topLeft.x, topLeft.y, bounds.width * tileWidth, bounds.height * tileHeight)
            .lineStyle(2, 0xffffff, 1)
            .strokeRect(topLeft.x, topLeft.y, bounds.width * tileWidth, bounds.height * tileHeight)
            .setDepth((phaserLayer?.depth ?? 0) + 2);
        if (phaserLayer !== undefined) {
            this.shapeOutline.setScrollFactor(phaserLayer.scrollFactorX, phaserLayer.scrollFactorY);
        }
        this.scene.markDirty();
    }

    private finishPaintStroke(): void {
        this.painting = false;
        this.lastPaintedTileKey = undefined;
        this.elevationPointerTile = undefined;
        this.nextElevationSculptAt = 0;
        this.strokeAutotile = undefined;
        this.strokeWaterFillGid = undefined;
        this.liquidStrokeAutotile = undefined;
        this.liquidStrokeSeed = undefined;
        this.liquidStrokePrevious = undefined;
        if (this.activeEditGroup !== undefined && this.activeEditGroup.length > 0)
            this.commitEdits(this.activeEditGroup);
        this.activeEditGroup = undefined;
        this.surfaceStrokeLayerName = undefined;
        this.surfaceStrokePlacementId = undefined;
    }

    private commitEdits(edits: FloorEdit[]): void {
        const forwardLayerEdit = edits.find((edit) => edit.forward.layerJson !== undefined)?.forward;
        const backwardLayerEdit = [...edits].reverse().find((edit) => edit.backward.layerJson !== undefined)?.backward;
        const mutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: collapseTileRegions(edits.flatMap((edit) => edit.forward.regions)),
            elevationUpdates: edits.flatMap((edit) => edit.forward.elevationUpdates ?? []),
            ...(forwardLayerEdit === undefined
                ? {}
                : {
                      layerJson: forwardLayerEdit.layerJson,
                      removeLayer: forwardLayerEdit.removeLayer,
                      beforeLayer: forwardLayerEdit.beforeLayer,
                  }),
        };
        const inverseMutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: collapseTileRegions([...edits].reverse().flatMap((edit) => edit.backward.regions)),
            elevationUpdates: [...edits].reverse().flatMap((edit) => edit.backward.elevationUpdates ?? []),
            ...(backwardLayerEdit === undefined
                ? {}
                : {
                      layerJson: backwardLayerEdit.layerJson,
                      removeLayer: backwardLayerEdit.removeLayer,
                      beforeLayer: backwardLayerEdit.beforeLayer,
                  }),
        };
        this.saving = true;
        this.setState({ status: "saving", error: undefined });
        this.mapEditorModeManager
            .executeCommand(ModifyTerrainFrontCommand.fromOptimisticPreview(this, mutation, inverseMutation))
            .catch((error) => this.rejectTerrainMutation(asError(error).message));
    }

    public applyTerrainMutation(mutation: TeapotTerrainMutation): void {
        if (!this.canApplyTerrainMutation(mutation)) throw new Error(OCCUPIED_TILE_DELETION_ERROR);
        this.applyTerrainMutationUnchecked(mutation);
    }

    public canApplyTerrainMutation(mutation: TeapotTerrainMutation): boolean {
        return !this.scene.getGameMapFrontWrapper().containsOccupiedVisualTileDeletion(mutation.regions);
    }

    public revertOptimisticTerrainMutation(mutation: TeapotTerrainMutation): void {
        this.applyTerrainMutationUnchecked(mutation);
    }

    private applyTerrainMutationUnchecked(mutation: TeapotTerrainMutation): void {
        const source = this.draftMap ?? this.draftBaseMap ?? this.publishedMap ?? structuredClone(this.scene.mapFile);
        const updated = applyTeapotTerrainMutation(source, mutation);
        this.draftMap = updated;
        this.scene.mapFile = structuredClone(updated);
        this.removeOrphanedLayerOverlays(updated);
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
        if (mutation.elevationUpdates !== undefined) this.scene.getElevationRenderer().render(updated);
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
        const restoredMap = this.draftBaseMap ?? this.publishedMap ?? structuredClone(this.scene.mapFile);
        this.publishedMap = structuredClone(restoredMap);
        this.scene.mapFile = structuredClone(restoredMap);
        this.draftMap = undefined;
        this.draftBaseMap = undefined;
        this.removeOrphanedLayerOverlays(restoredMap);
        this.previewRegions = [];
        this.changedTileKeys.clear();
        this.pendingTilesetSelection = undefined;
        this.saving = false;
        this.scene.getElevationRenderer().render(restoredMap);
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
        const { x: left, y: baseTop } = tileToWorldTopLeft(visibleMap, tile.x, tile.y);
        const pathOverlay = getAuthoringPathOverlay(visibleMap, tile.layer);
        const elevationMode = get(mapEditorFloorStateStore)?.toolMode === "elevation";
        const previewElevation = elevationMode
            ? Math.max(
                  0,
                  Math.min(
                      getElevationAt(visibleMap, ELEVATION_WORLD_LAYER, tile.x, tile.y) + this.elevationDirection,
                      20,
                  ),
              )
            : 0;
        const top = elevationMode ? baseTop - previewElevation * (tileHeight / 2) : baseTop;
        const hoverDepth = pathOverlay === undefined ? (phaserLayer?.depth ?? 0) + 2 : DEPTH_OVERLAY_INDEX + 2;
        if (pathOverlay === undefined && !elevationMode) {
            const tileTexture = this.getTileTexture(this.selectedGid);
            if (tileTexture !== undefined) {
                this.hoverTilePreview = this.scene.add
                    .image(left + tileWidth / 2, top + tileHeight / 2, tileTexture.textureKey, tileTexture.frame)
                    .setDisplaySize(tileWidth, tileHeight)
                    .setAlpha(0.85)
                    .setDepth(hoverDepth - 0.01);
                if (phaserLayer !== undefined) {
                    this.hoverTilePreview.setScrollFactor(phaserLayer.scrollFactorX, phaserLayer.scrollFactorY);
                }
            }
        }
        this.hoverOutline ??= this.scene.add.graphics();
        this.hoverOutline.clear();
        if (pathOverlay === undefined) {
            const radius = elevationMode ? this.elevationBrushRadius : 0;
            this.hoverOutline
                .fillStyle(this.elevationDirection === -1 ? 0xfb7185 : 0xffffff, 0.12)
                .fillRect(
                    left - radius * tileWidth,
                    top - radius * tileHeight,
                    tileWidth * (radius * 2 + 1),
                    tileHeight * (radius * 2 + 1),
                );
        } else {
            const colors = AUTHORING_PATH_OVERLAY_COLORS[pathOverlay.kind];
            const halfWidth = tileWidth / 2;
            const halfHeight = tileHeight / 2;
            this.hoverOutline
                .fillStyle(colors.base, 0.34)
                .fillRect(left, top, tileWidth, tileHeight)
                .fillStyle(colors.checks, 0.72)
                .fillRect(left, top, halfWidth, halfHeight)
                .fillRect(left + halfWidth, top + halfHeight, halfWidth, halfHeight);
        }
        this.hoverOutline
            .lineStyle(2, this.elevationDirection === -1 ? 0xfb7185 : 0xffffff, 0.95)
            .strokeRect(
                left - (elevationMode ? this.elevationBrushRadius : 0) * tileWidth,
                top - (elevationMode ? this.elevationBrushRadius : 0) * tileHeight,
                tileWidth * ((elevationMode ? this.elevationBrushRadius : 0) * 2 + 1),
                tileHeight * ((elevationMode ? this.elevationBrushRadius : 0) * 2 + 1),
            )
            .setDepth(hoverDepth);
        if (phaserLayer !== undefined) {
            this.hoverOutline.setScrollFactor(phaserLayer.scrollFactorX, phaserLayer.scrollFactorY);
        }
        mapEditorFloorStateStore.update((state) => (state === undefined ? state : { ...state, hoveredTile: tile }));
        this.scene.markDirty();
    }

    private clearHoverPreview(): void {
        this.hoverTilePreview?.destroy();
        this.hoverTilePreview = undefined;
        this.hoveredTile = undefined;
        this.hoverOutline?.clear();
        mapEditorFloorStateStore.update((state) =>
            state === undefined || state.hoveredTile === undefined ? state : { ...state, hoveredTile: undefined },
        );
        this.scene.markDirty();
    }

    private updateChangedTileKeys(regions: readonly TeapotTileRegion[], draft: ITiledMap): void {
        if (this.publishedMap === undefined) return;
        for (const region of regions) {
            const publishedLayer = findLayer(this.publishedMap.layers, region.layer);
            const draftLayer = findLayer(draft.layers, region.layer);
            if (draftLayer?.type !== "tilelayer") continue;
            for (let y = 0; y < region.height; y += 1) {
                for (let x = 0; x < region.width; x += 1) {
                    const absoluteX = region.x + x;
                    const absoluteY = region.y + y;
                    const key = tileKey(region.layer, absoluteX, absoluteY);
                    const publishedGid =
                        publishedLayer?.type === "tilelayer"
                            ? getTileLayerGid(publishedLayer, absoluteX, absoluteY)
                            : 0;
                    const draftGid = getTileLayerGid(draftLayer, absoluteX, absoluteY);
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
            const firstGid = existingTileset.firstgid ?? 1;
            const tileCount =
                "tilecount" in existingTileset && typeof existingTileset.tilecount === "number"
                    ? existingTileset.tilecount
                    : 1;
            const pendingSelection = selection === undefined ? undefined : { ...selection, firstGid, tileCount };
            if (pendingSelection !== undefined) {
                this.pendingTilesetSelection = pendingSelection;
                this.clearHoverPreview();
            }
            this.loadRuntimeTileset(firstGid, tileCount, tileset.url, tileset.id)
                .then(() => {
                    if (pendingSelection !== undefined && this.pendingTilesetSelection === pendingSelection) {
                        this.pendingTilesetSelection = undefined;
                        this.activateEmbeddedSelection(pendingSelection, firstGid, tileCount);
                    } else if (pendingSelection === undefined) {
                        this.setState({ status: "saved", error: undefined });
                    }
                })
                .catch((error: unknown) => {
                    if (this.pendingTilesetSelection === pendingSelection) this.pendingTilesetSelection = undefined;
                    this.setState({ status: "failed", error: asError(error).message });
                });
            return;
        }
        const result = addTeapotEmbeddedTileset(base, {
            name: `teapot-${tileset.id}-${tileset.name}`,
            image: tileset.url,
            imageWidth: tileset.width,
            imageHeight: tileset.height,
            animation: tileset.animation,
        });
        const addedTileset = result.map.tilesets.find((candidate) => candidate.firstgid === result.firstGid);
        if (addedTileset === undefined) throw new Error("The terrain tileset could not be embedded");
        if (selection !== undefined) {
            this.pendingTilesetSelection = {
                ...selection,
                firstGid: result.firstGid,
                tileCount: result.tileCount,
            };
            this.clearHoverPreview();
        }
        this.saving = true;
        this.setState({ status: "saving", changedTiles: 0, error: undefined });
        const mutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: [],
            tilesetJson: JSON.stringify(addedTileset),
        };
        const inverseMutation: TeapotTerrainMutation = { ...mutation, removeTileset: true };
        this.loadRuntimeTileset(result.firstGid, result.tileCount, tileset.url, tileset.id)
            .then(() =>
                this.mapEditorModeManager.executeCommand(
                    new ModifyTerrainFrontCommand(this, mutation, inverseMutation),
                ),
            )
            .then(() => {
                if (this.draftMap !== undefined && this.previewRegions.length > 0) {
                    this.renderRegions(this.previewRegions, this.draftMap);
                }
            })
            .catch((error: unknown) => this.rejectTerrainMutation(asError(error).message));
    }

    private activateEmbeddedSelection(selection: TilesetSelection, firstGid: number, tileCount: number): void {
        if (selection.kind === "tile") {
            this.selectEmbeddedTilesetTile(
                selection.layer,
                firstGid,
                tileCount,
                selection.tileId,
                selection.autotile,
                selection.waterFillTileId,
            );
            return;
        }
        this.selectEmbeddedTilesetShape(selection.layer, selection.familyId, firstGid, tileCount, selection.autotile);
    }

    private selectEmbeddedTilesetTile(
        layer: string,
        firstGid: number,
        tileCount: number,
        tileId: number,
        autotile?: TerrainAutotileTiles,
        waterFillTileId?: number,
    ): void {
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
        this.selectedAutotileForTileBrush =
            autotile === undefined
                ? this.getTileBrushAutotile(state, gid)
                : translateTerrainAutotileTiles(autotile, firstGid);
        this.selectedWaterFillGid =
            waterFillTileId === undefined ? this.getTileBrushWaterFillGid(state, gid) : firstGid + waterFillTileId;
        this.selectedTilesetFirstGid = this.selectedWaterFillGid === undefined ? firstGid : 0;
        this.setState({
            selectedLayer: layer,
            selectedGid: this.selectedGid,
            toolMode: "tile",
            selectedTerrainFamilyId: undefined,
            error: undefined,
        });
        this.updateCursor();
        this.refreshPathOverlay();
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
        this.selectedTilesetFirstGid = familyId === "water" ? 0 : firstGid;
        this.selectedAutotileForTileBrush = undefined;
        this.selectedWaterFillGid = familyId === "water" ? firstGid + autotile.center : undefined;
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
        this.refreshPathOverlay();
    }

    private renderRegions(regions: readonly TeapotTileRegion[], map: ITiledMap): void {
        const wrapper = this.scene.getGameMapFrontWrapper();
        wrapper.synchronizeMapGeometryIfNeeded(map);
        const renderedCells: { layer: string; x: number; y: number }[] = [];
        for (const region of regions) {
            const layer = findLayer(map.layers, region.layer);
            if (layer?.type !== "tilelayer") continue;
            for (let y = 0; y < region.height; y += 1) {
                for (let x = 0; x < region.width; x += 1) {
                    const absoluteX = region.x + x;
                    const absoluteY = region.y + y;
                    const gid = getTileLayerGid(layer, absoluteX, absoluteY);
                    this.renderTile(region.layer, absoluteX, absoluteY, gid, map, { deferRefresh: true });
                    renderedCells.push({ layer: region.layer, x: absoluteX, y: absoluteY });
                }
            }
        }
        wrapper.refreshTileBatch(renderedCells, map);
        this.refreshPathOverlay();
    }

    private refreshPathOverlay(): void {
        const map = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        if (map === undefined) {
            this.clearPathOverlay();
            return;
        }
        const overlay = getAuthoringPathOverlay(map, this.selectedLayer);
        if (overlay === undefined) {
            this.clearPathOverlay();
            return;
        }
        const colors = AUTHORING_PATH_OVERLAY_COLORS[overlay.kind];
        const phaserLayer = this.scene.getGameMapFrontWrapper().findPhaserLayer(this.selectedLayer);
        const tileWidth = map.tilewidth ?? 32;
        const tileHeight = map.tileheight ?? 32;
        const halfWidth = tileWidth / 2;
        const halfHeight = tileHeight / 2;
        this.pathOverlay ??= this.scene.add.graphics();
        this.pathOverlay.clear();
        for (const cell of overlay.cells) {
            const { x: left, y: top } = tileToWorldTopLeft(map, cell.x, cell.y);
            this.pathOverlay
                .fillStyle(colors.base, 0.2)
                .fillRect(left, top, tileWidth, tileHeight)
                .fillStyle(colors.checks, 0.48)
                .fillRect(left, top, halfWidth, halfHeight)
                .fillRect(left + halfWidth, top + halfHeight, halfWidth, halfHeight);
        }
        this.pathOverlay.setDepth(DEPTH_OVERLAY_INDEX + 1);
        if (phaserLayer !== undefined) {
            this.pathOverlay.setScrollFactor(phaserLayer.scrollFactorX, phaserLayer.scrollFactorY);
        }
        this.scene.markDirty();
    }

    private clearPathOverlay(): void {
        this.pathOverlay?.destroy();
        this.pathOverlay = undefined;
    }

    private renderTile(
        layer: string,
        x: number,
        y: number,
        gid: number,
        map: ITiledMap,
        options: { deferRefresh?: boolean } = {},
    ): void {
        const overlayKey = tileKey(layer, x, y);
        this.tileOverlays.get(overlayKey)?.destroy();
        this.tileOverlays.delete(overlayKey);
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        const phaserLayer = gameMapFrontWrapper.findPhaserLayer(layer);
        const underlayCoverLayer = waterUnderlayCoverLayerName(layer);
        const surfaceCoverLayer = surfaceOverlayCoverLayerName(layer);
        const compositeCoverLayer = underlayCoverLayer ?? surfaceCoverLayer;
        const renderReferenceLayer =
            phaserLayer ??
            (compositeCoverLayer === undefined ? undefined : gameMapFrontWrapper.findPhaserLayer(compositeCoverLayer));
        const pathOverlayKind = getAuthoringPathOverlayKind(layer);
        if (pathOverlayKind !== undefined) {
            // Collision markers must stay non-empty for Arcade Physics; checker overlays own all path visuals.
            gameMapFrontWrapper.putTile(gid === 0 ? null : gid, x, y, layer, {
                render: pathOverlayKind === "collision",
                deferRefresh: options.deferRefresh,
            });
            return;
        }
        if (!tileLayerCanRenderGid(phaserLayer, gid)) {
            const tileTexture = this.getTileTexture(gid);
            if (tileTexture !== undefined) {
                gameMapFrontWrapper.putTile(null, x, y, layer, options);
                this.renderOverlay(
                    overlayKey,
                    x,
                    y,
                    tileTexture.textureKey,
                    tileTexture.frame,
                    map,
                    renderReferenceLayer,
                    underlayCoverLayer === undefined ? 0.01 : -0.01,
                    compositeCoverLayer ?? layer,
                );
                return;
            }
        }
        gameMapFrontWrapper.putTile(gid === 0 ? null : gid, x, y, layer, options);
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
        depthOffset: number,
        compositeLayer: string,
    ): void {
        const tileWidth = map.tilewidth ?? 32;
        const tileHeight = map.tileheight ?? 32;
        const centre = tileToWorldCenter(map, x, y);
        const overlay = this.scene.add
            .image(centre.x, centre.y, textureKey, frame)
            .setDisplaySize(tileWidth, tileHeight);
        overlay.setData(ELEVATION_COMPOSITE_LAYER_DATA_KEY, compositeLayer);
        if (phaserLayer !== undefined) {
            overlay.setScrollFactor(phaserLayer.scrollFactorX, phaserLayer.scrollFactorY);
            this.scene
                .getGameMapFrontWrapper()
                .addToTileLayerRenderBand(phaserLayer, overlay, phaserLayer.depth + depthOffset);
        }
        this.tileOverlays.set(overlayKey, overlay);
    }

    private removeOrphanedLayerOverlays(map: ITiledMap): void {
        const layerNames = new Set(flattenLayers(map.layers).map((layer) => layer.name));
        for (const [key, overlay] of this.tileOverlays) {
            if (layerNames.has(key.split("\u0000", 1)[0])) continue;
            overlay.destroy();
            this.tileOverlays.delete(key);
        }
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

        if (!this.scene.Terrains.some((terrain) => terrain.firstgid === firstGid)) {
            const runtimeTileset = new Phaser.Tilemaps.Tileset(`teapot-runtime-${id}`, firstGid, 32, 32).setImage(
                this.scene.textures.get(textureKey),
            );
            this.scene.Map.tilesets.push(runtimeTileset);
            this.scene.Terrains.push(runtimeTileset);
            const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
            gameMapFrontWrapper.addTerrain(runtimeTileset);
        }
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
            .filter(
                (layer) =>
                    layer.type === "tilelayer" &&
                    waterUnderlayCoverLayerName(layer.name) === undefined &&
                    surfaceOverlayCoverLayerName(layer.name) === undefined,
            )
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
            toolMode:
                previous?.toolMode === "elevation" && this.selectedLayer !== ""
                    ? "elevation"
                    : this.selectedAutotile === undefined
                      ? "tile"
                      : "shape",
            selectedTerrainFamilyId: this.selectedAutotile?.familyId,
            hoveredTile: this.hoveredTile,
            ...update,
        }));
    }

    private getSurfaceOverlayLayerName(): string | undefined {
        return this.surfaceStrokeLayerName;
    }

    private getSurfaceOverlayLayer(map: ITiledMap): ITiledMapTileLayer | undefined {
        const name = this.getSurfaceOverlayLayerName();
        if (name === undefined) return undefined;
        const layer = findLayer(map.layers, name);
        return layer?.type === "tilelayer" ? layer : undefined;
    }

    private getMissingSurfaceOverlayLayer(map: ITiledMap, targetLayerName: string): ITiledMapTileLayer | undefined {
        if (
            targetLayerName !== this.getSurfaceOverlayLayerName() ||
            this.surfaceStrokePlacementId === undefined ||
            this.getSurfaceOverlayLayer(map) !== undefined
        )
            return undefined;
        const layer = createSurfaceOverlayLayer(
            map,
            this.selectedLayer,
            this.selectedTilesetFirstGid,
            this.surfaceStrokePlacementId,
        );
        return layer.type === "tilelayer" ? layer : undefined;
    }
}

function flattenLayers(layers: ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => [layer, ...(layer.type === "group" ? flattenLayers(layer.layers) : [])]);
}

function findLayer(layers: ITiledMapLayer[], name: string): ITiledMapLayer | undefined {
    return flattenLayers(layers).find((layer) => layer.name === name);
}

/** Reads only the occupancy needed to contour the edited cells and their one-tile halo. */
function collectTerrainTiles(
    layer: ITiledMapTileLayer,
    start: { x: number; y: number },
    end: { x: number; y: number },
    padding: number,
): { x: number; y: number; gid: number }[] {
    const minX = Math.min(start.x, end.x) - padding;
    const maxX = Math.max(start.x, end.x) + padding;
    const minY = Math.min(start.y, end.y) - padding;
    const maxY = Math.max(start.y, end.y) + padding;
    const result: { x: number; y: number; gid: number }[] = [];
    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const gid = getTileLayerGid(layer, x, y);
            if (gid !== 0) result.push({ x, y, gid });
        }
    }
    return result;
}

function getMatchingTerrainFamilyGids(map: ITiledMap, selectedGid: number): ReadonlySet<number> {
    const tilesets = map.tilesets
        .filter((tileset) => typeof tileset.firstgid === "number")
        .sort((left, right) => (left.firstgid ?? 0) - (right.firstgid ?? 0));
    const selectedTileset = [...tilesets].reverse().find((tileset) => (tileset.firstgid ?? 0) <= selectedGid);
    if (
        selectedTileset === undefined ||
        selectedTileset.firstgid === undefined ||
        !("image" in selectedTileset) ||
        typeof selectedTileset.image !== "string" ||
        !BUILT_IN_TERRAIN_TILESET.matchesImage(selectedTileset.image)
    ) {
        return new Set([selectedGid]);
    }
    const localAutotile = getBuiltInTerrainAutotile(selectedGid - selectedTileset.firstgid);
    if (localAutotile === undefined) return new Set([selectedGid]);

    const familyGids = new Set<number>();
    for (const tileset of tilesets) {
        if (
            tileset.firstgid === undefined ||
            !("image" in tileset) ||
            typeof tileset.image !== "string" ||
            !BUILT_IN_TERRAIN_TILESET.matchesImage(tileset.image)
        ) {
            continue;
        }
        for (const localGid of Object.values(localAutotile)) familyGids.add(tileset.firstgid + localGid);
    }
    return familyGids;
}

function getTerrainAutotileFamilies(map: ITiledMap): TerrainAutotileFamily[] {
    const families: TerrainAutotileFamily[] = [];
    for (const tileset of map.tilesets) {
        if (
            tileset.firstgid === undefined ||
            !("image" in tileset) ||
            typeof tileset.image !== "string" ||
            !BUILT_IN_TERRAIN_TILESET.matchesImage(tileset.image)
        )
            continue;
        for (const group of BUILT_IN_TERRAIN_TILESET.groups) {
            if (group.id === "water" || group.autotile === undefined) continue;
            const translated = translateTerrainAutotileTiles(group.autotile, tileset.firstgid);
            families.push({ tiles: translated, gids: new Set(Object.values(translated)) });
        }
    }
    return families;
}

function tileKey(layer: string, x: number, y: number): string {
    return `${layer}\u0000${x}\u0000${y}`;
}

function getElevationDirection(pointer: Phaser.Input.Pointer): 1 | -1 {
    const event = pointer.event as { metaKey?: boolean; ctrlKey?: boolean } | undefined;
    return event?.metaKey === true || event?.ctrlKey === true ? -1 : 1;
}

function isShiftDown(pointer: Phaser.Input.Pointer, shiftKey: Phaser.Input.Keyboard.Key | undefined): boolean {
    const event = pointer.event as { shiftKey?: boolean } | undefined;
    return event?.shiftKey === true || shiftKey?.isDown === true;
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
