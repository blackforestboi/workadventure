import {
    addTeapotEmbeddedTileset,
    applyTeapotTerrainMutation,
    applyTeapotTilePatch,
    getTileLayerGid,
    tileToWorldCenter,
    tileToWorldTopLeft,
    type TeapotTerrainMutation,
    TeapotTilePatch,
    type TeapotTileRegion,
    worldToTileCoordinates,
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
import {
    BUILT_IN_TERRAIN_TILESET,
    getBuiltInTerrainAutotile,
    getBuiltInTerrainTileIds,
} from "../../../../Services/BuiltInTerrainCatalog";
import { DEPTH_OVERLAY_INDEX } from "../../DepthIndexes";
import {
    appendDefaultCollisionRegions,
    findAuthoringPathBrushGid,
    getAuthoringPathOverlay,
    getAuthoringPathOverlayKind,
} from "../../GameMap/AuthoringCollision";
import type { GameMapFrontWrapper } from "../../GameMap/GameMapFrontWrapper";
import type { GameScene } from "../../GameScene";
import { ModifyTerrainFrontCommand } from "../Commands/Terrain/ModifyTerrainFrontCommand";
import type { MapEditorModeManager } from "../MapEditorModeManager";
import { hasPointerDragged } from "../PanGesture";
import { collapseTileRegions, createFloorEdit, type FloorEdit } from "./FloorEditorHistory";
import { collectTerrainGids, findTopmostErasableLayer, getTerrainTilesetGids } from "./FloorEditorCatalog";
import { findTilesetForGid, tileLayerCanRenderGid } from "./FloorEditorRendering";
import { MapEditorTool } from "./MapEditorTool";

type TilesetSelection =
    | { kind: "tile"; layer: string; tileId: number; autotile?: TerrainAutotileTiles }
    | { kind: "shape"; layer: string; familyId: string; autotile: TerrainAutotileTiles };

type PendingTilesetSelection = TilesetSelection & { firstGid: number; tileCount: number };

type ShapeBrush = { kind: "autotile"; tiles: TerrainAutotileTiles } | { kind: "tile"; gid: number };

const AUTHORING_PATH_OVERLAY_COLORS = {
    collision: { base: 0x4d9dff, checks: 0x84bdff },
    exit: { base: 0xf59e0b, checks: 0xfcd34d },
    start: { base: 0x22c55e, checks: 0x86efac },
} as const;

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
    private pendingTilesetSelection: PendingTilesetSelection | undefined;
    private selectedAutotile: { familyId: string; tiles: TerrainAutotileTiles } | undefined;
    private selectedAutotileForTileBrush: TerrainAutotileTiles | undefined;
    private shapeStart: { layer: string; x: number; y: number } | undefined;
    private shapeEnd: { layer: string; x: number; y: number } | undefined;
    private shapeBrush: ShapeBrush | undefined;
    private strokeAutotile: TerrainAutotileTiles | undefined;
    private liquidStrokeAutotile: TerrainAutotileTiles | undefined;
    private liquidStrokeSeed: { layer: string; x: number; y: number } | undefined;
    private liquidStrokePrevious: { layer: string; x: number; y: number } | undefined;
    private shapeOutline: GameObjects.Graphics | undefined;
    private hoveredTile: { layer: string; x: number; y: number } | undefined;
    private hoverTilePreview: GameObjects.Image | undefined;
    private hoverOutline: GameObjects.Graphics | undefined;
    private painting = false;
    private panCandidate = false;
    private panning = false;
    private lastPaintedTileKey: string | undefined;
    private activeEditGroup: FloorEdit[] | undefined;
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

    public update(_time: number, _dt: number): void {}

    public clear(): void {
        this.clearHoverPreview();
        this.clearPathOverlay();
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
        this.selectedAutotileForTileBrush = undefined;
        this.strokeAutotile = undefined;
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
            if (action.type === "select-library-brush") {
                this.addTileset(action.tileset, {
                    kind: "tile",
                    layer: action.layer,
                    tileId: action.tileId,
                    autotile: getBuiltInTerrainAutotile(action.tileId),
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

    private preview(patch: TeapotTilePatch, recordHistory = true): boolean {
        if (this.publishedMap === undefined) throw new Error("The current map is not loaded");
        if (patch.mapId !== this.scene.getMapUrl()) throw new Error("This patch belongs to a different map");
        if (!this.canApplyTerrainMutation({ mapId: patch.mapId, regions: patch.regions })) {
            this.setState({ status: "failed", error: OCCUPIED_TILE_DELETION_ERROR });
            return false;
        }
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
        this.selectedAutotileForTileBrush = this.getTileBrushAutotile(state, selectedGid);
        this.selectedLayer = layer;
        this.selectedGid = selectedGid;
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
        this.selectedLayer = "";
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
        if (this.shapeStart !== undefined && this.shapeBrush !== undefined && pointer.leftButtonDown()) {
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
        const tile = this.getTileAtPointer(pointer);
        if (tile === undefined) return;
        const shapeBrush =
            this.selectedAutotile === undefined
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
        this.strokeAutotile = this.selectedAutotileForTileBrush;
        this.liquidStrokeAutotile = this.strokeAutotile;
        this.liquidStrokeSeed = this.liquidStrokeAutotile === undefined ? undefined : tile;
        this.liquidStrokePrevious = this.liquidStrokeSeed;
        this.paintTile(tile);
    }

    private handlePointerUp(pointer: Phaser.Input.Pointer): void {
        this.stopPanning(pointer);
        if (this.shapeStart !== undefined && this.shapeEnd !== undefined && this.shapeBrush !== undefined) {
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
        if (this.publishedMap === undefined || this.selectedLayer === "" || this.pendingTilesetSelection !== undefined)
            return undefined;
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const coordinates = worldToTileCoordinates(visibleMap, pointer.worldX, pointer.worldY);
        const targetLayer =
            this.selectedGid === 0 && getAuthoringPathOverlayKind(this.selectedLayer) === undefined
                ? (findTopmostErasableLayer(visibleMap.layers, coordinates.x, coordinates.y) ?? this.selectedLayer)
                : this.selectedLayer;
        const layer = findLayer(visibleMap.layers, targetLayer);
        if (layer?.type !== "tilelayer") return undefined;
        return { layer: targetLayer, ...coordinates };
    }

    private paintTile(tile: { layer: string; x: number; y: number }): void {
        if (this.publishedMap === undefined) return;
        const key = tileKey(tile.layer, tile.x, tile.y);
        this.lastPaintedTileKey = key;
        const visibleMap = this.draftMap ?? this.draftBaseMap ?? this.publishedMap;
        const terrainLayer = findLayer(visibleMap.layers, tile.layer);
        const previous = this.liquidStrokePrevious ?? tile;
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
        const applied = this.preview(
            TeapotTilePatch.parse({
                mapId: this.scene.getMapUrl(),
                expectedRevision: 0,
                regions: rawRegions,
            }),
        );
        if (applied && this.liquidStrokeAutotile !== undefined) this.liquidStrokePrevious = tile;
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
        const patch = TeapotTilePatch.parse({
            mapId: this.scene.getMapUrl(),
            expectedRevision: 0,
            regions: rawRegions,
        });
        const edit = createFloorEdit(source, patch);
        if (edit === undefined) return;
        if (this.preview(patch, false)) this.commitEdits([edit]);
    }

    private cancelShapeDrag(): void {
        this.painting = false;
        this.shapeStart = undefined;
        this.shapeEnd = undefined;
        this.shapeBrush = undefined;
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
        this.strokeAutotile = undefined;
        this.liquidStrokeAutotile = undefined;
        this.liquidStrokeSeed = undefined;
        this.liquidStrokePrevious = undefined;
        if (this.activeEditGroup !== undefined && this.activeEditGroup.length > 0)
            this.commitEdits(this.activeEditGroup);
        this.activeEditGroup = undefined;
    }

    private commitEdits(edits: FloorEdit[]): void {
        const mutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: collapseTileRegions(edits.flatMap((edit) => edit.forward.regions)),
        };
        const inverseMutation: TeapotTerrainMutation = {
            mapId: this.scene.getMapUrl(),
            regions: collapseTileRegions([...edits].reverse().flatMap((edit) => edit.backward.regions)),
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
        const applied =
            mutation.regions.length > 0
                ? applyTeapotTilePatch(
                      source,
                      TeapotTilePatch.parse({
                          mapId: mutation.mapId,
                          expectedRevision: 0,
                          regions: mutation.regions,
                      }),
                  )
                : undefined;
        const updated = applied?.map ?? applyTeapotTerrainMutation(source, mutation);
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
        const restoredMap = this.draftBaseMap ?? this.publishedMap ?? structuredClone(this.scene.mapFile);
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
        const { x: left, y: top } = tileToWorldTopLeft(visibleMap, tile.x, tile.y);
        const pathOverlay = getAuthoringPathOverlay(visibleMap, tile.layer);
        const hoverDepth = pathOverlay === undefined ? (phaserLayer?.depth ?? 0) + 2 : DEPTH_OVERLAY_INDEX + 2;
        if (pathOverlay === undefined) {
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
            this.hoverOutline.fillStyle(0xffffff, 0.12).fillRect(left, top, tileWidth, tileHeight);
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
            .lineStyle(2, 0xffffff, 0.95)
            .strokeRect(left, top, tileWidth, tileHeight)
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
            if (publishedLayer?.type !== "tilelayer" || draftLayer?.type !== "tilelayer") continue;
            for (let y = 0; y < region.height; y += 1) {
                for (let x = 0; x < region.width; x += 1) {
                    const absoluteX = region.x + x;
                    const absoluteY = region.y + y;
                    const key = tileKey(region.layer, absoluteX, absoluteY);
                    const publishedGid = getTileLayerGid(publishedLayer, absoluteX, absoluteY);
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
            this.selectEmbeddedTilesetTile(selection.layer, firstGid, tileCount, selection.tileId, selection.autotile);
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
        this.selectedAutotileForTileBrush = undefined;
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
        wrapper.synchronizeMapGeometry(map);
        for (const region of regions) {
            const layer = findLayer(map.layers, region.layer);
            if (layer?.type !== "tilelayer") continue;
            for (let y = 0; y < region.height; y += 1) {
                for (let x = 0; x < region.width; x += 1) {
                    const absoluteX = region.x + x;
                    const absoluteY = region.y + y;
                    const gid = getTileLayerGid(layer, absoluteX, absoluteY);
                    this.renderTile(region.layer, absoluteX, absoluteY, gid, map);
                }
            }
        }
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

    private renderTile(layer: string, x: number, y: number, gid: number, map: ITiledMap): void {
        const overlayKey = tileKey(layer, x, y);
        this.tileOverlays.get(overlayKey)?.destroy();
        this.tileOverlays.delete(overlayKey);
        const gameMapFrontWrapper = this.scene.getGameMapFrontWrapper();
        const phaserLayer = gameMapFrontWrapper.findPhaserLayer(layer);
        const pathOverlayKind = getAuthoringPathOverlayKind(layer);
        if (pathOverlayKind !== undefined) {
            // Collision markers must stay non-empty for Arcade Physics; checker overlays own all path visuals.
            gameMapFrontWrapper.putTile(gid === 0 ? null : gid, x, y, layer, {
                render: pathOverlayKind === "collision",
            });
            return;
        }
        if (!tileLayerCanRenderGid(phaserLayer, gid)) {
            const tileTexture = this.getTileTexture(gid);
            if (tileTexture !== undefined) {
                gameMapFrontWrapper.putTile(null, x, y, layer);
                this.renderOverlay(overlayKey, x, y, tileTexture.textureKey, tileTexture.frame, map, phaserLayer);
                return;
            }
        }
        gameMapFrontWrapper.putTile(gid === 0 ? null : gid, x, y, layer);
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
        const centre = tileToWorldCenter(map, x, y);
        const overlay = this.scene.add
            .image(centre.x, centre.y, textureKey, frame)
            .setDisplaySize(tileWidth, tileHeight);
        if (phaserLayer !== undefined) {
            overlay.setScrollFactor(phaserLayer.scrollFactorX, phaserLayer.scrollFactorY);
            this.scene
                .getGameMapFrontWrapper()
                .addToTileLayerRenderBand(phaserLayer, overlay, phaserLayer.depth + 0.01);
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
            .filter((layer) => layer.type === "tilelayer")
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
