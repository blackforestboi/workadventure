import * as Phaser from "phaser";
import type {
    AreaChangeCallback,
    AreaData,
    AtLeast,
    GameMap,
    AreaDataProperties,
    AreaUpdateCallback,
    ChunkTileBounds,
} from "@workadventure/map-editor";
import {
    AreaCoordinates,
    containsOccupiedVisualTileDeletion,
    forEachTileInLayer,
    GameMapProperties,
    getMapTileBounds,
    getMapWorldBounds,
    getTileGridOffset,
    getTileLayerGid,
    getTileLayerWorldOrigin,
    isAvatarSupportingTileLayerName,
    surfaceOverlayCoverLayerName,
    tileToLayerIndex,
    type TeapotTileRegion,
    waterUnderlayCoverLayerName,
    worldToTileCoordinates,
} from "@workadventure/map-editor";
import { MathUtils } from "@workadventure/math-utils";
import type {
    ITiledMap,
    ITiledMapLayer,
    ITiledMapObject,
    ITiledMapProperty,
    ITiledMapTileLayer,
    Json,
} from "@workadventure/tiled-map-type-guard";
import type { Observable } from "rxjs";
import { Subject } from "rxjs";
import { Deferred } from "@workadventure/shared-utils";
import { PathTileType } from "../../../Utils/PathfindingManager";
import type { Entity } from "../../ECS/Entity";
import type { ITiledPlace } from "../GameMapPropertiesListener";
import type { DepthGameObject, GameRenderLayers, MapRenderBand } from "../GameRenderLayers";
import type { GameScene } from "../GameScene";
import { collisionRectanglesOverlap, type EntityCollisionRectangle } from "../MapEditor/Entities/EntityCollisionGrid";
import { getCompositeTileLayerBaseName, getCompositeTileLayerDepthOffset } from "./CompositeTileLayerOrder";
import { EntitiesManager } from "./EntitiesManager";
import { AreasManager } from "./AreasManager";
import { replacePhaserTileProperties } from "./TilePropertySync";
import {
    composeCollisionGrid,
    getAuthoringCollisionGrid,
    getPhysicalTileCollisionMode,
    getTileSupportGrid,
    isAuthoringCollisionLayer,
    isCollisionStorageLayer,
    type CollisionGridLayer,
} from "./AuthoringCollision";
import { getTileLayerRenderPlacement, resolveTileLayerWorldOrigin } from "./TilemapRendererSelection";
import { getResidentTileWindow, residentTileWindowNeedsRecentering } from "./ResidentTileWindow";

import TilemapLayer = Phaser.Tilemaps.TilemapLayer;
import TilemapGPULayer = Phaser.Tilemaps.TilemapGPULayer;
import Tilemap = Phaser.Tilemaps.Tilemap;
import Tile = Phaser.Tilemaps.Tile;
import Tileset = Phaser.Tilemaps.Tileset;
import WebGLRenderer = Phaser.Renderer.WebGL.WebGLRenderer;
import ArcadeBody = Phaser.Physics.Arcade.Body;
import Container = Phaser.GameObjects.Container;

type RenderableTilemapLayer = TilemapLayer | TilemapGPULayer;
type MapLayerRenderObject = RenderableTilemapLayer | Container;
type RenderableLayerEntry = { layer: RenderableTilemapLayer; renderObject: MapLayerRenderObject };
type TileAnimationData = {
    animation?: Array<{ duration?: number }>;
};

const TILED_TILE_FLIP_FLAGS = 0xe0000000;
const TILE_ANIMATION_REFRESH_FALLBACK_MS = 100;

export type DynamicArea = {
    name: string;
    x: number;
    y: number;
    width: number;
    height: number;
    properties: { [key: string]: unknown };
};

export type LayerChangeCallback = (
    layersChangedByAction: Array<ITiledMapLayer>,
    allLayersOnNewPosition: Array<ITiledMapLayer>,
) => void;

export type TiledAreaChangeCallback = (
    areasChangedByAction: Array<ITiledMapObject>,
    allAreasOnNewPosition: Array<ITiledMapObject>,
) => void;

export type DynamicAreaChangeCallback = (
    areasChangedByAction: Array<DynamicArea>,
    allAreasOnNewPosition: Array<DynamicArea>,
) => void;

export type PropertyChangeCallback = (
    newValue: string | number | boolean | undefined,
    oldValue: string | number | boolean | undefined,
    allProps: Map<string, string | boolean | number>,
) => void;

export class GameMapFrontWrapper {
    private scene: GameScene;
    private gameMap: GameMap;

    private oldKey: number | undefined;
    /**
     * key is the index of the current tile.
     */
    private key: number | undefined;
    /**
     * oldPosition is the previous position of the player.
     */
    private oldPosition: { x: number; y: number } | undefined;
    /**
     * position is the current position of the player.
     */
    private position: { x: number; y: number } | undefined;

    /**
     * Manager for renderable, interactive objects that players can work with.
     */
    private entitiesManager: EntitiesManager;

    public readonly phaserMap: Tilemap;
    public readonly phaserLayers: RenderableTilemapLayer[] = [];
    private readonly gpuLayerContainers = new Map<TilemapGPULayer, Container>();
    /**
     * Areas that we can do CRUD operations on via scripting API
     */
    public readonly dynamicAreas: Map<string, DynamicArea> = new Map<string, DynamicArea>();

    public collisionGrid: number[][];
    /**
     * A layer containing collide tiles mapping the collision zones of restricted areas put with the map editor
     */
    private areasCollisionLayer: TilemapLayer;
    /** A hidden layer that blocks cells without a visible visual tile. */
    private voidCollisionLayer: TilemapLayer;

    private collisionGridDirty = true;
    private areasCollisionLayerDirty = true;
    private perLayerCollisionGridCache: Map<number, (0 | 1 | 2 | 3)[][]> = new Map<number, (0 | 1 | 2 | 3)[][]>();
    private dirtyLayerIndices: Set<number> = new Set<number>();

    private lastProperties = new Map<string, string | boolean | number>();
    private propertiesChangeCallbacks = new Map<string, Array<PropertyChangeCallback>>();

    private enterLayerCallbacks = Array<LayerChangeCallback>();
    private leaveLayerCallbacks = Array<LayerChangeCallback>();

    private enterTiledAreaCallbacks = Array<TiledAreaChangeCallback>();
    private leaveTiledAreaCallbacks = Array<TiledAreaChangeCallback>();

    private enterDynamicAreaCallbacks = Array<DynamicAreaChangeCallback>();
    private leaveDynamicAreaCallbacks = Array<DynamicAreaChangeCallback>();

    public areasManager: AreasManager | undefined;

    /**
     * Cache of area IDs that have maxUsersInAreaPropertyData.
     * This avoids iterating through all properties on every position change.
     * Updated when areas are added, removed, or modified.
     */
    private areasWithMaxUsersProperty: Set<string> = new Set();

    /**
     * Firing on map change, containing newest collision grid array
     */
    private mapChangedSubject = new Subject<number[][]>();

    /**
     * HACK: We need an existing tile index when populating synthetic tile collision layers.
     * This is needed since 3.60.0. For some reason, index of -1 value is no longer working properly with default collision system
     * for tiles.
     */
    private readonly existingTileIndex;

    public readonly initializedPromise = new Deferred<void>();

    private getTileLayerRenderBands(): Map<string, MapRenderBand> {
        let renderBand: MapRenderBand = "background";
        const layerRenderBands = new Map<string, MapRenderBand>();
        const coverLayerNames = new Map<string, string>();
        for (const layer of this.gameMap.flatLayers) {
            if (layer.type === "tilelayer") {
                layerRenderBands.set(layer.name, renderBand);
                const coverLayerName =
                    surfaceOverlayCoverLayerName(layer.name) ?? waterUnderlayCoverLayerName(layer.name);
                if (coverLayerName !== undefined) coverLayerNames.set(layer.name, coverLayerName);
            }
            if (layer.type === "objectgroup" && layer.name === "floorLayer") renderBand = "foreground";
        }

        const resolvingLayerNames = new Set<string>();
        const resolveLayerRenderBand = (layerName: string): MapRenderBand | undefined => {
            const ownRenderBand = layerRenderBands.get(layerName);
            const coverLayerName = coverLayerNames.get(layerName);
            if (coverLayerName === undefined || resolvingLayerNames.has(layerName)) return ownRenderBand;
            resolvingLayerNames.add(layerName);
            const resolvedRenderBand = resolveLayerRenderBand(coverLayerName) ?? ownRenderBand;
            resolvingLayerNames.delete(layerName);
            if (resolvedRenderBand !== undefined) layerRenderBands.set(layerName, resolvedRenderBand);
            return resolvedRenderBand;
        };
        for (const layerName of layerRenderBands.keys()) {
            resolveLayerRenderBand(layerName);
        }
        return layerRenderBands;
    }

    constructor(
        scene: GameScene,
        gameMap: GameMap,
        phaserMap: Tilemap,
        terrains: Array<Tileset>,
        private readonly gameRenderLayers: GameRenderLayers,
    ) {
        this.scene = scene;
        this.gameMap = gameMap;
        this.phaserMap = phaserMap;

        this.existingTileIndex = terrains.length > 0 ? terrains[0].firstgid : -1;

        this.entitiesManager = new EntitiesManager(this.scene, this);

        const layerRenderBands = this.getTileLayerRenderBands();
        const localDepth: Record<MapRenderBand, number> = { background: 0, foreground: 0 };
        const renderedTileLayers = new Map<string, RenderableLayerEntry>();
        for (const layer of this.gameMap.flatLayers) {
            if (layer.type === "tilelayer") {
                const layerRenderBand = layerRenderBands.get(layer.name) ?? "background";
                const renderableLayer = this.createRenderableLayer(layer, terrains);
                if (renderableLayer) {
                    const { layer: phaserLayer, renderObject } = renderableLayer;
                    phaserLayer
                        .setScrollFactor(layer.parallaxx ?? 1, layer.parallaxy ?? 1)
                        .setAlpha(layer.opacity)
                        .setVisible(isCollisionStorageLayer(layer.name) ? false : layer.visible);
                    const compositeBaseLayerName = getCompositeTileLayerBaseName(layer.name);
                    const baseRenderableLayer =
                        compositeBaseLayerName === layer.name
                            ? undefined
                            : renderedTileLayers.get(compositeBaseLayerName);
                    if (baseRenderableLayer === undefined) {
                        this.gameRenderLayers.addMapLayer(renderObject, layerRenderBand, localDepth[layerRenderBand]++);
                    } else {
                        this.gameRenderLayers.addToSameMapBand(
                            baseRenderableLayer.renderObject,
                            renderObject,
                            baseRenderableLayer.renderObject.depth +
                                getCompositeTileLayerDepthOffset(this.gameMap.flatLayers, layer.name),
                        );
                    }
                    this.phaserLayers.push(phaserLayer);
                    renderedTileLayers.set(layer.name, renderableLayer);
                }
            }
        }

        let nbUnnamedTileArea = 0;

        // NOTE: We leave "zone" for legacy reasons
        this.gameMap.tiledObjects
            .filter((object) => ["zone", "area"].includes(object.class ?? ""))
            .forEach((tiledArea: ITiledMapObject) => {
                if (!tiledArea.name) {
                    tiledArea.name = "unnamed_tiled_area_" + nbUnnamedTileArea;
                    nbUnnamedTileArea++;
                }

                if (tiledArea.width === undefined || tiledArea.height === undefined) {
                    console.warn("Areas must be square objects. Object " + tiledArea.name + " is not square.");
                    return;
                }
                // In case an area already exists with the same name, we rename it to avoid conflicts
                if (this.dynamicAreas.get(tiledArea.name)) {
                    console.warn("There are several '" + tiledArea.name + "' areas existing in your Tiled map.");
                    tiledArea.name = "unnamed_tiled_area_" + nbUnnamedTileArea;
                    nbUnnamedTileArea++;
                }
                this.dynamicAreas.set(tiledArea.name, {
                    name: tiledArea.name,
                    width: tiledArea.width,
                    height: tiledArea.height,
                    x: tiledArea.x,
                    y: tiledArea.y,
                    properties: this.mapTiledPropertiesToDynamicAreaProperties(tiledArea.properties ?? []),
                });
            });

        this.collisionGrid = [];
        const mapBounds = this.getCollisionGridBounds();
        const phaserBlankCollisionsLayer2 = phaserMap.createBlankLayer("__areasCollisionLayer", terrains);
        if (!phaserBlankCollisionsLayer2) {
            throw new Error("Could not create areas collision layer");
        }
        this.areasCollisionLayer = phaserBlankCollisionsLayer2;
        this.areasCollisionLayer.setPosition(mapBounds.x, mapBounds.y);
        this.areasCollisionLayer.setCollisionByProperty({ collides: true }).setVisible(false);
        this.gameRenderLayers.addMapLayer(this.areasCollisionLayer, "background", localDepth.background++);

        this.phaserLayers.push(this.areasCollisionLayer);

        const phaserVoidCollisionLayer = phaserMap.createBlankLayer("__voidCollisionLayer", terrains);
        if (!phaserVoidCollisionLayer) {
            throw new Error("Could not create void collision layer");
        }
        this.voidCollisionLayer = phaserVoidCollisionLayer;
        this.voidCollisionLayer.setPosition(mapBounds.x, mapBounds.y);
        this.voidCollisionLayer.setCollisionByProperty({ collides: true }).setVisible(false);
        this.gameRenderLayers.addMapLayer(this.voidCollisionLayer, "background", localDepth.background++);
        this.phaserLayers.push(this.voidCollisionLayer);
        this.rebuildVoidCollisionLayer();
    }

    private createRenderableLayer(layer: ITiledMapTileLayer, terrains: Array<Tileset>): RenderableLayerEntry | null {
        const gpuTileset = this.getGpuTilesetForLayer(layer, terrains);
        const origin = getTileLayerWorldOrigin(this.gameMap.getRuntimeMap(), layer);
        const placement = getTileLayerRenderPlacement(origin, gpuTileset !== undefined);

        const phaserLayer = this.phaserMap.createLayer(
            layer.name,
            gpuTileset ?? terrains,
            placement.layer.x,
            placement.layer.y,
            gpuTileset !== undefined,
        );
        if (phaserLayer === null || placement.parent === undefined) {
            return phaserLayer === null ? null : { layer: phaserLayer, renderObject: phaserLayer };
        }

        const gpuLayer = phaserLayer as TilemapGPULayer;
        const container = new Container(this.scene, placement.parent.x, placement.parent.y, [gpuLayer]).setName(
            `${layer.name}:gpu-world-origin`,
        );
        this.gpuLayerContainers.set(gpuLayer, container);
        return { layer: gpuLayer, renderObject: container };
    }

    private getGpuTilesetForLayer(layer: ITiledMapTileLayer, terrains: Array<Tileset>): Tileset | undefined {
        if (
            terrains.length === 0 ||
            !(this.scene.game.renderer instanceof WebGLRenderer) ||
            this.getMap().orientation !== "orthogonal"
        ) {
            return undefined;
        }

        const tileIndices = this.getLayerTileIndices(layer);
        if (!tileIndices) {
            return undefined;
        }

        let layerTileset: Tileset | undefined;
        for (const tileIndex of tileIndices) {
            const tileset = terrains.find((terrain) => terrain.containsTileIndex(tileIndex));
            if (!tileset) {
                return undefined;
            }
            if (tileset.tileWidth !== this.phaserMap.tileWidth || tileset.tileHeight !== this.phaserMap.tileHeight) {
                return undefined;
            }
            if (layerTileset && layerTileset !== tileset) {
                return undefined;
            }
            layerTileset = tileset;
        }

        return layerTileset;
    }

    private getLayerTileIndices(layer: ITiledMapTileLayer): Set<number> | undefined {
        const tileIndices = new Set<number>();
        let valid = true;
        forEachTileInLayer(layer, (tileId) => {
            if (typeof tileId !== "number") {
                valid = false;
                return;
            }
            const tileIndex = tileId & ~TILED_TILE_FLIP_FLAGS;
            if (tileIndex > 0) {
                tileIndices.add(tileIndex);
            }
        });
        return valid ? tileIndices : undefined;
    }

    public getTileAnimationRefreshDelay(): number | undefined {
        let refreshDelay: number | undefined;
        for (const phaserLayer of this.phaserLayers) {
            for (const tileset of this.getTilesetsForLayer(phaserLayer)) {
                const tilesetDelay = this.getTilesetAnimationRefreshDelay(tileset);
                if (tilesetDelay === undefined) {
                    continue;
                }
                refreshDelay = refreshDelay === undefined ? tilesetDelay : Math.min(refreshDelay, tilesetDelay);
            }
        }

        return refreshDelay;
    }

    public setTileAnimationsPaused(paused: boolean): void {
        for (const phaserLayer of this.phaserLayers) {
            phaserLayer.setTimerPaused(paused);
        }
    }

    private getTilesetsForLayer(layer: RenderableTilemapLayer): Tileset[] {
        return this.isGpuTilemapLayer(layer) ? [layer.tileset] : layer.tileset;
    }

    private getTilesetAnimationRefreshDelay(tileset: Tileset): number | undefined {
        const tileData = tileset.tileData as Record<string, TileAnimationData | undefined>;
        let refreshDelay: number | undefined;

        for (const tileDatum of Object.values(tileData)) {
            if (!tileDatum?.animation) {
                continue;
            }
            const animationDelay =
                tileDatum.animation.reduce<number | undefined>((minimumDelay, frame) => {
                    if (!frame.duration || frame.duration <= 0) {
                        return minimumDelay;
                    }
                    return minimumDelay === undefined ? frame.duration : Math.min(minimumDelay, frame.duration);
                }, undefined) ?? TILE_ANIMATION_REFRESH_FALLBACK_MS;
            const clampedAnimationDelay = Math.max(16, animationDelay);

            refreshDelay =
                refreshDelay === undefined ? clampedAnimationDelay : Math.min(refreshDelay, clampedAnimationDelay);
        }

        return refreshDelay;
    }

    private isGpuTilemapLayer(layer: RenderableTilemapLayer): layer is TilemapGPULayer {
        return "generateLayerDataTexture" in layer;
    }

    public initialize(): Promise<void> {
        // Spawn first entities from WAM file on the map
        const addEntityPromises: Promise<Entity>[] = [];
        for (const [entityId, entityData] of Object.entries(
            this.gameMap.getWamFile()?.getGameMapEntities().getEntities() ?? {},
        )) {
            addEntityPromises.push(this.entitiesManager.addEntity(entityId, entityData));
            // We need to AWAIT for all entities to be created.
            // OTHERWISE, delete commands might pass FIRST!
        }

        return Promise.allSettled(addEntityPromises).then((promiseResults) => {
            promiseResults.forEach((result) => {
                if (result.status === "rejected") {
                    console.error(result.reason);
                }
            });
            this.initializedPromise.resolve();
        });
    }

    public recomputeAreasCollisionGrid() {
        this.invalidateCollisionGrid({ areasLayerDirty: true });
    }

    public initializeAreaManager(userConnectedTags: string[], userCanEdit: boolean) {
        const gameMapAreas = this.getGameMap().getWamFile()?.getGameMapAreas();
        // If gameMapAreas is undefined, we are on a public map
        if (gameMapAreas !== undefined) {
            this.areasManager = new AreasManager(
                this.scene,
                gameMapAreas,
                userConnectedTags,
                userCanEdit,
                undefined,
                () => this.invalidateCollisionGrid({ areasLayerDirty: true }),
            );
            gameMapAreas.triggerAreasChange(undefined, this.position);
            // Initialize the cache of areas with maxUsersInAreaPropertyData
            this.rebuildMaxUsersAreasCache();
        }
        // Once we have the tags, we can compute the colliding layer again
        this.recomputeAreasCollisionGrid();
    }

    /**
     * Rebuilds the cache of areas that have maxUsersInAreaPropertyData.
     * Should be called when areas are added, removed, or their properties change.
     */
    private rebuildMaxUsersAreasCache(): void {
        this.areasWithMaxUsersProperty.clear();
        const allAreas = this.gameMap.getWamFile()?.getGameMapAreas().getAreas();
        if (!allAreas) {
            return;
        }
        for (const area of allAreas.values()) {
            if (this.areaHasMaxUsersProperty(area)) {
                this.areasWithMaxUsersProperty.add(area.id);
            }
        }
    }

    /**
     * Checks if an area has maxUsersInAreaPropertyData property.
     */
    private areaHasMaxUsersProperty(area: AreaData): boolean {
        return area.properties.some((property) => property.type === "maxUsersInAreaPropertyData");
    }

    /**
     * Gets the IDs of nearby areas that have maxUsersInAreaPropertyData.
     * Uses an optimized bounding box check instead of distance calculation.
     * @param position - The player's current position
     * @param proximityThreshold - Distance in pixels to consider "nearby" (default: 100)
     * @returns Array of area IDs that are nearby
     */
    private getNearbyMaxUsersAreas(position: { x: number; y: number }, proximityThreshold = 100): string[] {
        const nearbyAreaIds: string[] = [];
        const gameMapAreas = this.gameMap.getWamFile()?.getGameMapAreas();
        if (!gameMapAreas) {
            return nearbyAreaIds;
        }

        const playerX = position.x;
        const playerY = position.y;

        // Only iterate through cached areas with maxUsersProperty
        for (const areaId of this.areasWithMaxUsersProperty) {
            const area = gameMapAreas.getArea(areaId);
            if (!area) {
                continue;
            }

            // Optimized bounding box proximity check:
            // Check if player is within (area bounds + threshold) using simple comparisons
            // This avoids Math.abs and is more efficient for rectangular areas
            const areaLeft = area.x - proximityThreshold;
            const areaRight = area.x + area.width + proximityThreshold;
            const areaTop = area.y - proximityThreshold;
            const areaBottom = area.y + area.height + proximityThreshold;

            if (playerX >= areaLeft && playerX <= areaRight && playerY >= areaTop && playerY <= areaBottom) {
                nearbyAreaIds.push(areaId);
            }
        }

        return nearbyAreaIds;
    }

    public setLayerVisibility(layerName: string, visible: boolean): void {
        const phaserLayer = this.findPhaserLayer(layerName);
        if (phaserLayer != undefined) {
            const renderedVisible = visible && !isCollisionStorageLayer(phaserLayer.layer.name);
            phaserLayer.setVisible(renderedVisible);
            this.configurePhysicalCollision(phaserLayer, renderedVisible);
            this.rebuildVoidCollisionLayer();
        } else {
            const phaserLayers = this.findPhaserLayers(layerName + "/");
            if (phaserLayers.length === 0) {
                console.warn(
                    'Could not find layer with name that contains "' +
                        layerName +
                        '" when calling WA.hideLayer / WA.showLayer',
                );
                return;
            }
            for (let i = 0; i < phaserLayers.length; i++) {
                const renderedVisible = visible && !isCollisionStorageLayer(phaserLayers[i].layer.name);
                phaserLayers[i].setVisible(renderedVisible);
                this.configurePhysicalCollision(phaserLayers[i], renderedVisible);
            }
            this.rebuildVoidCollisionLayer();
        }
    }

    public configurePhysicalCollision(phaserLayer: RenderableTilemapLayer, enabled = true): void {
        const hasAuthoringCollisionLayer = this.phaserLayers.some((layer) =>
            isAuthoringCollisionLayer(layer.layer.name),
        );
        switch (getPhysicalTileCollisionMode(phaserLayer.layer.name, hasAuthoringCollisionLayer)) {
            case "occupied":
                phaserLayer.setCollisionByExclusion([-1], true);
                break;
            case "disabled":
                phaserLayer.setCollisionByExclusion([], false);
                break;
            case "properties":
                phaserLayer.setCollisionByProperty({ collides: true }, enabled);
                break;
        }
    }

    private rebuildVoidCollisionLayer(): void {
        const supportGrid = this.getCurrentTileSupportGrid();
        for (let y = 0; y < supportGrid.length; y += 1) {
            for (let x = 0; x < supportGrid[y].length; x += 1) {
                this.setVoidCollisionCell(x, y, supportGrid[y][x]);
            }
        }
        this.voidCollisionLayer.setCollisionByProperty({ collides: true });
        this.invalidateCollisionGrid({ modifiedLayer: this.voidCollisionLayer });
    }

    private refreshVoidCollisionCell(tileX: number, tileY: number): void {
        const bounds = this.getRuntimeTileBounds();
        const x = tileX - bounds.x;
        const y = tileY - bounds.y;
        const supportGrid = this.getCurrentTileSupportGrid();
        if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) return;
        this.setVoidCollisionCell(x, y, supportGrid[y][x]);
        this.voidCollisionLayer.setCollisionByProperty({ collides: true });
        this.invalidateCollisionGrid({ modifiedLayer: this.voidCollisionLayer });
    }

    private setVoidCollisionCell(x: number, y: number, supported: boolean): void {
        if (supported) {
            this.voidCollisionLayer.removeTileAt(x, y, false);
            return;
        }
        const tile = this.voidCollisionLayer.putTileAt(this.existingTileIndex, x, y);
        if (tile !== null) tile.properties[GameMapProperties.COLLIDES] = true;
    }

    private getCurrentTileSupportGrid(): boolean[][] {
        const map = this.getRuntimeGridMap();
        const applyRuntimeVisibility = (layers: readonly ITiledMapLayer[], prefix: string): ITiledMapLayer[] =>
            layers.map((layer): ITiledMapLayer => {
                const fullName = prefix + layer.name;
                if (layer.type === "group") {
                    return { ...layer, layers: applyRuntimeVisibility(layer.layers, fullName + "/") };
                }
                return { ...layer, visible: this.findPhaserLayer(fullName)?.visible ?? layer.visible };
            });
        return getTileSupportGrid({ ...map, layers: applyRuntimeVisibility(map.layers, "") });
    }

    /** Dense data is resident-bounded; removing chunks makes grid helpers honor the declared resident rectangle. */
    private getRuntimeGridMap(): ITiledMap {
        const runtimeMap = this.gameMap.getRuntimeMap();
        const materializeLayers = (layers: readonly ITiledMapLayer[], prefix: string): ITiledMapLayer[] =>
            layers.map((layer): ITiledMapLayer => {
                const fullName = prefix + layer.name;
                if (layer.type === "group") {
                    return { ...layer, layers: materializeLayers(layer.layers, fullName + "/") };
                }
                if (layer.type !== "tilelayer") return layer;
                const flatLayer = this.gameMap.findLayer(fullName);
                return flatLayer?.type === "tilelayer"
                    ? { ...layer, chunks: undefined, data: flatLayer.data }
                    : { ...layer, chunks: undefined };
            });
        return { ...runtimeMap, layers: materializeLayers(runtimeMap.layers, "") };
    }

    private registerCollisionArea(area: AreaData): void {
        const start = this.areasCollisionLayer.worldToTileXY(area.x, area.y, true);
        const end = this.areasCollisionLayer.worldToTileXY(area.x + area.width, area.y + area.height, false);
        const xStart = Math.floor(start.x);
        const yStart = Math.floor(start.y);
        const xEnd = Math.ceil(end.x);
        const yEnd = Math.ceil(end.y);

        for (let y = yStart; y < yEnd; y += 1) {
            for (let x = xStart; x < xEnd; x += 1) {
                const tile = this.areasCollisionLayer.putTileAt(this.existingTileIndex, x, y);
                if (tile !== null) {
                    tile.properties["collides"] = true;
                }
            }
        }
    }

    public getPropertiesForIndex(index: number): Array<ITiledMapProperty> {
        return this.gameMap.getPropertiesForIndex(index);
    }

    public getCollisionGrid({ emitMapChangedEvent = true }: { emitMapChangedEvent?: boolean } = {}): number[][] {
        this.ensureCollisionGridUpToDate(emitMapChangedEvent);
        return this.collisionGrid;
    }

    /** Pixel bounds represented by the current collision/pathfinding grid. */
    public getCollisionGridBounds(): { x: number; y: number; width: number; height: number } {
        const tileBounds = this.getRuntimeTileBounds();
        const tileDimensions = this.gameMap.getTileDimensions();
        const offset = getTileGridOffset(this.gameMap.getMap());
        return {
            x: offset.x + tileBounds.x * tileDimensions.width,
            y: offset.y + tileBounds.y * tileDimensions.height,
            width: tileBounds.width * tileDimensions.width,
            height: tileBounds.height * tileDimensions.height,
        };
    }

    public getResidentTileBounds(): ChunkTileBounds | undefined {
        return this.gameMap.getResidentTileBounds();
    }

    /**
     * Moves the bounded runtime allocation when focus leaves its safe interior. The canonical map remains untouched.
     */
    public recenterResidentTileWindowAtWorldPosition(worldX: number, worldY: number, force = false): boolean {
        const current = this.gameMap.getResidentTileBounds();
        if (current === undefined) return false;
        const focusTile = worldToTileCoordinates(this.gameMap.getMap(), worldX, worldY);
        if (!force && !residentTileWindowNeedsRecentering(current, focusTile)) return false;

        const next = getResidentTileWindow(this.gameMap.getMap(), focusTile);
        if (
            next.x === current.x &&
            next.y === current.y &&
            next.width === current.width &&
            next.height === current.height
        ) {
            return false;
        }

        this.gameMap.setResidentTileBounds(next);
        this.repopulateResidentLayers();
        this.perLayerCollisionGridCache.clear();
        this.dirtyLayerIndices = new Set(this.phaserLayers.map((layer) => layer.layerIndex));
        this.areasCollisionLayerDirty = true;
        this.collisionGridDirty = true;
        this.rebuildVoidCollisionLayer();
        this.ensureCollisionGridUpToDate(true);
        return true;
    }

    private getRuntimeTileBounds(): ChunkTileBounds {
        const resident = this.gameMap.getResidentTileBounds();
        if (resident !== undefined) return resident;
        const bounds = getMapTileBounds(this.gameMap.getRuntimeMap());
        return { x: bounds.minX, y: bounds.minY, width: bounds.width, height: bounds.height };
    }

    private invalidateCollisionGrid({
        areasLayerDirty = false,
        modifiedLayer,
    }: { areasLayerDirty?: boolean; modifiedLayer?: RenderableTilemapLayer } = {}): void {
        if (areasLayerDirty) {
            this.areasCollisionLayerDirty = true;
        }
        if (modifiedLayer) {
            this.dirtyLayerIndices.add(modifiedLayer.layerIndex);
        }
        this.collisionGridDirty = true;
    }

    private rebuildAreasCollisionLayer(): void {
        //this.areasCollisionLayer.fill(-1);
        const map = this.gameMap.getRuntimeMap();
        for (let y = 0; y < (map.height ?? 0); y++) {
            for (let x = 0; x < (map.width ?? 0); x++) {
                this.areasCollisionLayer.removeTileAt(x, y, false);
            }
        }

        if (this.areasManager) {
            for (const area of this.areasManager.getCollidingAreas()) {
                this.registerCollisionArea(area);
            }
        }

        this.areasCollisionLayerDirty = false;
        this.dirtyLayerIndices.add(this.areasCollisionLayer.layerIndex);
    }

    private ensureCollisionGridUpToDate(emitMapChangedEvent = true): void {
        if (!this.collisionGridDirty) {
            return;
        }

        if (this.areasCollisionLayerDirty) {
            this.rebuildAreasCollisionLayer();
        }

        const map = this.getRuntimeGridMap();
        // initialize collision grid to write on
        if (map.height === undefined || map.width === undefined) {
            this.collisionGrid = [];
            this.collisionGridDirty = false;
            return;
        }
        const collisionLayers: CollisionGridLayer[] = [];
        for (const layer of this.phaserLayers) {
            const isAuthoringCollision = isAuthoringCollisionLayer(layer.layer.name);
            if (isCollisionStorageLayer(layer.layer.name) && !isAuthoringCollision) continue;
            const cachedLayer = this.perLayerCollisionGridCache.get(layer.layerIndex);
            const shouldRecomputeLayer =
                this.dirtyLayerIndices.has(layer.layerIndex) ||
                !cachedLayer ||
                cachedLayer.length !== map.height ||
                cachedLayer[0]?.length !== map.width;
            const layerCollisionGrid = shouldRecomputeLayer
                ? isAuthoringCollision
                    ? getAuthoringCollisionGrid(map)
                    : this.getLayerCollisionGrid(layer)
                : cachedLayer;
            if (shouldRecomputeLayer) {
                this.perLayerCollisionGridCache.set(layer.layerIndex, layerCollisionGrid);
                this.dirtyLayerIndices.delete(layer.layerIndex);
            }
            collisionLayers.push({
                kind:
                    layer === this.areasCollisionLayer || layer === this.voidCollisionLayer
                        ? "dynamic-collision"
                        : isAuthoringCollision
                          ? "authoring-collision"
                          : "regular",
                visible: layer.visible,
                grid: layerCollisionGrid,
            });
        }
        const grid = composeCollisionGrid(map.width, map.height, collisionLayers);
        this.applyPathfindingAreaWeights(grid, map.width, map.height);
        this.collisionGrid = grid;
        this.collisionGridDirty = false;
        if (emitMapChangedEvent) {
            this.mapChangedSubject.next(this.collisionGrid);
        }
    }

    /**
     * Marks walkable tiles under meeting (Jitsi/Livekit) and personal desk areas with higher pathfinding cost.
     * Meeting overlaps take precedence over personal desk on the same tile.
     */
    private applyPathfindingAreaWeights(grid: number[][], mapWidth: number, mapHeight: number): void {
        const gameMapAreas = this.gameMap.getWamFile()?.getGameMapAreas();
        if (!gameMapAreas) {
            return;
        }

        const tileWidth = this.getMap().tilewidth ?? 32;
        const tileHeight = this.getMap().tileheight ?? 32;
        const mapBounds = this.getCollisionGridBounds();

        const personalAreas: AreaData[] = [];
        const meetingAreas: AreaData[] = [];
        for (const area of gameMapAreas.getAreas().values()) {
            const hasMeeting = area.properties.some(
                (p) => p.type === "jitsiRoomProperty" || p.type === "livekitRoomProperty",
            );
            const hasPersonalDesk = area.properties.some((p) => p.type === "personalAreaPropertyData");
            if (hasPersonalDesk) {
                personalAreas.push(area);
            }
            if (hasMeeting) {
                meetingAreas.push(area);
            }
        }

        const paintArea = (area: AreaData, tileType: PathTileType): void => {
            const xStart = Math.floor((area.x - mapBounds.x) / tileWidth);
            const yStart = Math.floor((area.y - mapBounds.y) / tileHeight);
            const xEnd = Math.ceil((area.x + area.width - mapBounds.x) / tileWidth);
            const yEnd = Math.ceil((area.y + area.height - mapBounds.y) / tileHeight);

            for (let y = yStart; y < yEnd; y += 1) {
                if (y < 0 || y >= mapHeight) {
                    continue;
                }
                for (let x = xStart; x < xEnd; x += 1) {
                    if (x < 0 || x >= mapWidth) {
                        continue;
                    }
                    if (grid[y][x] === PathTileType.Walkable) {
                        grid[y][x] = tileType;
                    }
                }
            }
        };

        for (const area of personalAreas) {
            paintArea(area, PathTileType.PersonalDesk);
        }
        for (const area of meetingAreas) {
            paintArea(area, PathTileType.MeetingRoom);
        }
    }

    public getTileDimensions(): { width: number; height: number } {
        return this.gameMap.getTileDimensions();
    }

    public getTileIndexAt(x: number, y: number): { x: number; y: number } {
        return this.gameMap.getTileIndexAt(x, y);
    }

    /**
     * Sets the position of the current player (in pixels)
     * This will trigger events if properties are changing.
     */
    public setPosition(x: number, y: number) {
        const map = this.getMap();
        if (!map.width || !map.height) {
            return;
        }
        this.oldPosition = this.position;
        this.position = { x, y };
        const areasChanged = this.gameMap
            .getWamFile()
            ?.getGameMapAreas()
            .triggerAreasChange(this.oldPosition, this.position);
        const dynamicAreasChanged = this.triggerDynamicAreasChange(this.oldPosition, this.position);
        if (areasChanged || dynamicAreasChanged) {
            this.triggerAllProperties();
        }

        // Update collision states for areas when player position changes
        // This recalculates collision based on current user count when player moves
        // Also check nearby areas to prevent collision message when area becomes available
        if (this.areasManager && this.position) {
            const areasOnNewPosition = this.gameMap.getWamFile()?.getGameMapAreas()?.getAreasOnPosition(this.position);
            if (areasOnNewPosition && areasOnNewPosition.length > 0) {
                const affectedAreaIds = areasOnNewPosition.map((area) => area.id);
                this.areasManager.updateAreasCollision(affectedAreaIds);
            }

            // Also update collision for nearby areas that might be approached
            // This prevents showing error message when area becomes available
            // Only check areas that have maxUsersInAreaPropertyData (using cached set for O(1) lookup)
            if (this.areasWithMaxUsersProperty.size > 0) {
                const nearbyAreaIds = this.getNearbyMaxUsersAreas(this.position);
                if (nearbyAreaIds.length > 0) {
                    this.areasManager.updateAreasCollision(nearbyAreaIds);
                }
            }
        }

        this.oldKey = this.key;

        const { x: xMap, y: yMap } = this.gameMap.getTileIndexAt(x, y);
        const key = xMap + yMap * map.width;

        if (key === this.key) {
            return;
        }

        this.key = key;

        this.triggerAllProperties();
        this.triggerLayersChange();
    }

    public getCurrentProperties(): Map<string, string | boolean | number> {
        return this.lastProperties;
    }

    public clearCurrentProperties(): void {
        return this.lastProperties.clear();
    }

    public getMap(): ITiledMap {
        return this.gameMap.getMap();
    }

    /**
     * Registers a callback called when the user moves to a tile where the property propName is different from the last tile the user was on.
     */
    public onPropertyChange(propName: string, callback: PropertyChangeCallback) {
        let callbacksArray = this.propertiesChangeCallbacks.get(propName);
        if (callbacksArray === undefined) {
            callbacksArray = new Array<PropertyChangeCallback>();
            this.propertiesChangeCallbacks.set(propName, callbacksArray);
        }
        callbacksArray.push(callback);
    }

    /**
     * Registers a callback called when the user moves inside another layer.
     */
    public onEnterLayer(callback: LayerChangeCallback) {
        this.enterLayerCallbacks.push(callback);
    }

    /**
     * Registers a callback called when the user moves outside another layer.
     */
    public onLeaveLayer(callback: LayerChangeCallback) {
        this.leaveLayerCallbacks.push(callback);
    }

    /**
     * Registers a callback called when the user moves inside another Tiled Area.
     */
    public onEnterTiledArea(callback: TiledAreaChangeCallback) {
        this.enterTiledAreaCallbacks.push(callback);
    }

    /**
     * Registers a callback called when the user moves outside another Tiled Area.
     */
    public onLeaveTiledArea(callback: TiledAreaChangeCallback) {
        this.leaveTiledAreaCallbacks.push(callback);
    }

    /**
     * Registers a callback called when the user moves inside another Dynamic Area.
     */
    public onEnterDynamicArea(callback: DynamicAreaChangeCallback) {
        this.enterDynamicAreaCallbacks.push(callback);
    }

    /**
     * Registers a callback called when the user moves outside another Dynamic Area.
     */
    public onLeaveDynamicArea(callback: DynamicAreaChangeCallback) {
        this.leaveDynamicAreaCallbacks.push(callback);
    }

    /**
     * Registers a callback called when the user moves inside another area.
     */
    public onEnterArea(callback: AreaChangeCallback) {
        this.gameMap.getWamFile()?.onEnterArea(callback);
    }

    /**
     * Registers a callback called when an area has been updated.
     */
    public onUpdateArea(callback: AreaUpdateCallback) {
        this.gameMap.getWamFile()?.onUpdateArea(callback);
    }

    /**
     * Registers a callback called when the user moves outside another area.
     */
    public onLeaveArea(callback: AreaChangeCallback) {
        this.gameMap.getWamFile()?.getGameMapAreas().onLeaveArea(callback);
    }

    public findLayer(layerName: string): ITiledMapLayer | undefined {
        return this.gameMap.findLayer(layerName);
    }

    public findObject(objectName: string, objectClass?: string): ITiledMapObject | undefined {
        return this.gameMap.findObject(objectName, objectClass);
    }

    public findPhaserLayer(layerName: string): RenderableTilemapLayer | undefined {
        return this.phaserLayers.find((layer) => layer.layer.name === layerName);
    }

    public addToTileLayerRenderBand<T extends DepthGameObject>(
        sourceLayer: RenderableTilemapLayer,
        gameObject: T,
        localDepth = sourceLayer.depth,
    ): boolean {
        const renderObject = this.getLayerRenderObject(sourceLayer);
        const renderDepth = renderObject.depth + localDepth - sourceLayer.depth;
        return this.gameRenderLayers.addToSameMapBand(renderObject, gameObject, renderDepth);
    }

    private getLayerRenderObject(layer: RenderableTilemapLayer): MapLayerRenderObject {
        return this.isGpuTilemapLayer(layer) ? (this.gpuLayerContainers.get(layer) ?? layer) : layer;
    }

    private getRenderableLayerWorldOrigin(layer: RenderableTilemapLayer): { x: number; y: number } {
        const parent = this.isGpuTilemapLayer(layer) ? this.gpuLayerContainers.get(layer) : undefined;
        return resolveTileLayerWorldOrigin({
            layer: { x: layer.x, y: layer.y },
            parent: parent === undefined ? undefined : { x: parent.x, y: parent.y },
        });
    }

    private setRenderableLayerWorldOrigin(layer: RenderableTilemapLayer, origin: { x: number; y: number }): void {
        const placement = getTileLayerRenderPlacement(origin, this.isGpuTilemapLayer(layer));
        layer.setPosition(placement.layer.x, placement.layer.y);
        if (placement.parent !== undefined && this.isGpuTilemapLayer(layer)) {
            this.gpuLayerContainers.get(layer)?.setPosition(placement.parent.x, placement.parent.y);
        }
    }

    public findPhaserLayers(groupName: string): RenderableTilemapLayer[] {
        return this.phaserLayers.filter((l) => l.layer.name.includes(groupName));
    }

    public addTerrain(terrain: Tileset): void {
        for (const phaserLayer of this.phaserLayers) {
            if (this.isGpuTilemapLayer(phaserLayer)) {
                continue;
            }
            phaserLayer.tileset.push(terrain);
        }
    }

    private repopulateResidentLayers(): void {
        const runtimeMap = this.gameMap.getRuntimeMap();
        const bounds = this.getRuntimeTileBounds();
        const worldBounds = this.getCollisionGridBounds();

        this.phaserMap.width = bounds.width;
        this.phaserMap.height = bounds.height;
        this.phaserMap.widthInPixels = worldBounds.width;
        this.phaserMap.heightInPixels = worldBounds.height;

        for (const phaserLayer of this.phaserLayers) {
            const layerData = phaserLayer.layer;
            const sourceLayer = this.gameMap.findLayer(layerData.name);
            layerData.data = Array.from({ length: bounds.height }, () =>
                Array<Tile | null>(bounds.width).fill(null),
            ) as Tile[][];
            layerData.width = bounds.width;
            layerData.height = bounds.height;
            layerData.widthInPixels = bounds.width * layerData.tileWidth;
            layerData.heightInPixels = bounds.height * layerData.tileHeight;

            const origin =
                sourceLayer?.type === "tilelayer"
                    ? getTileLayerWorldOrigin(runtimeMap, sourceLayer)
                    : { x: worldBounds.x, y: worldBounds.y };
            this.setRenderableLayerWorldOrigin(phaserLayer, origin);
            phaserLayer.setSize(layerData.widthInPixels, layerData.heightInPixels);

            if (sourceLayer?.type === "tilelayer" && Array.isArray(sourceLayer.data)) {
                for (let index = 0; index < sourceLayer.data.length; index += 1) {
                    const rawGid = sourceLayer.data[index];
                    if (rawGid === 0) continue;
                    const x = index % sourceLayer.width;
                    const y = Math.floor(index / sourceLayer.width);
                    const gid = Phaser.Tilemaps.Parsers.Tiled.ParseGID(rawGid);
                    const tile = phaserLayer.putTileAt(gid.gid, x, y, false);
                    if (tile === null) continue;
                    tile.rotation = gid.rotation;
                    tile.flipX = gid.flipped;
                    replacePhaserTileProperties(tile, this.gameMap.getTileProperty(gid.gid));
                }
            }

            this.configurePhysicalCollision(phaserLayer, phaserLayer.visible);
            if (this.isGpuTilemapLayer(phaserLayer)) phaserLayer.generateLayerDataTexture();
        }
    }

    public synchronizeMapGeometry(source: ITiledMap): void {
        const previousMap = this.gameMap.getMap();
        const previousOffset = getTileGridOffset(previousMap);
        const nextBounds = getMapTileBounds(source);
        const nextWorldBounds = getMapWorldBounds(source);
        this.gameMap.synchronizeTileLayers(source);

        if (this.gameMap.getResidentTileBounds() !== undefined) {
            this.repopulateResidentLayers();
            this.scene.physics.world.setBounds(
                nextWorldBounds.x,
                nextWorldBounds.y,
                nextWorldBounds.width,
                nextWorldBounds.height,
            );
            this.scene
                .getCameraManager()
                .setMapSize(nextWorldBounds.width, nextWorldBounds.height, nextWorldBounds.x, nextWorldBounds.y);
            this.perLayerCollisionGridCache.clear();
            this.dirtyLayerIndices = new Set(this.phaserLayers.map((layer) => layer.layerIndex));
            this.areasCollisionLayerDirty = true;
            this.collisionGridDirty = true;
            this.rebuildVoidCollisionLayer();
            return;
        }

        this.phaserMap.width = nextBounds.width;
        this.phaserMap.height = nextBounds.height;
        this.phaserMap.widthInPixels = nextWorldBounds.width;
        this.phaserMap.heightInPixels = nextWorldBounds.height;

        for (const phaserLayer of this.phaserLayers) {
            const layer = phaserLayer.layer;
            const previousData = layer.data;
            const previousOrigin = this.getRenderableLayerWorldOrigin(phaserLayer);
            const previousStartX = Math.round((previousOrigin.x - previousOffset.x) / this.phaserMap.tileWidth);
            const previousStartY = Math.round((previousOrigin.y - previousOffset.y) / this.phaserMap.tileHeight);
            const sourceLayer = this.gameMap.findLayer(layer.name);
            const nextStartX =
                sourceLayer?.type === "tilelayer" ? (sourceLayer.startx ?? nextBounds.minX) : nextBounds.minX;
            const nextStartY =
                sourceLayer?.type === "tilelayer" ? (sourceLayer.starty ?? nextBounds.minY) : nextBounds.minY;
            const data: Tile[][] = [];
            for (let y = 0; y < nextBounds.height; y += 1) {
                const row: Tile[] = [];
                const previousY = nextStartY + y - previousStartY;
                for (let x = 0; x < nextBounds.width; x += 1) {
                    const previousX = nextStartX + x - previousStartX;
                    const existing = previousData[previousY]?.[previousX];
                    if (existing !== undefined && existing !== null) {
                        existing.x = x;
                        existing.y = y;
                        existing.updatePixelXY();
                        row.push(existing);
                    } else {
                        row.push(
                            new Tile(
                                layer,
                                -1,
                                x,
                                y,
                                layer.tileWidth,
                                layer.tileHeight,
                                this.phaserMap.tileWidth,
                                this.phaserMap.tileHeight,
                            ),
                        );
                    }
                }
                data[y] = row;
            }
            layer.data = data;
            layer.width = nextBounds.width;
            layer.height = nextBounds.height;
            layer.widthInPixels = nextBounds.width * layer.tileWidth;
            layer.heightInPixels = nextBounds.height * layer.tileHeight;
            const layerOrigin =
                sourceLayer?.type === "tilelayer"
                    ? getTileLayerWorldOrigin(source, sourceLayer)
                    : { x: nextWorldBounds.x, y: nextWorldBounds.y };
            this.setRenderableLayerWorldOrigin(phaserLayer, layerOrigin);
            phaserLayer.setSize(layer.widthInPixels, layer.heightInPixels);
            if (this.isGpuTilemapLayer(phaserLayer)) phaserLayer.generateLayerDataTexture();
        }

        this.scene.physics.world.setBounds(
            nextWorldBounds.x,
            nextWorldBounds.y,
            nextWorldBounds.width,
            nextWorldBounds.height,
        );
        this.scene
            .getCameraManager()
            .setMapSize(nextWorldBounds.width, nextWorldBounds.height, nextWorldBounds.x, nextWorldBounds.y);
        this.collisionGridDirty = true;
        this.dirtyLayerIndices = new Set(this.phaserLayers.map((layer) => layer.layerIndex));
        this.rebuildVoidCollisionLayer();
    }

    public synchronizeMapGeometryIfNeeded(source: ITiledMap): void {
        const currentBounds = getMapTileBounds(this.gameMap.getMap());
        const nextBounds = getMapTileBounds(source);
        const currentOffset = getTileGridOffset(this.gameMap.getMap());
        const nextOffset = getTileGridOffset(source);
        if (
            currentBounds.minX === nextBounds.minX &&
            currentBounds.minY === nextBounds.minY &&
            currentBounds.width === nextBounds.width &&
            currentBounds.height === nextBounds.height &&
            currentOffset.x === nextOffset.x &&
            currentOffset.y === nextOffset.y
        ) {
            return;
        }
        this.synchronizeMapGeometry(source);
    }

    public putTile(
        tile: string | number | null,
        x: number,
        y: number,
        layer: string,
        options: { render?: boolean; deferRefresh?: boolean } = {},
    ): void {
        if (tile === null && isAvatarSupportingTileLayerName(layer) && this.isTileOccupiedByAvatar(x, y)) {
            console.warn(`Cannot delete the tile at (${x}, ${y}) while an avatar is standing on it.`);
            return;
        }
        const phaserLayer = this.findPhaserLayer(layer);
        if (!phaserLayer) {
            console.error("The layer '" + layer + "' does not exist (or is not a tilelayer).");
            return;
        }

        const render = options.render !== false;
        const tileIndex = tile === null ? 0 : this.gameMap.getIndexForTileType(tile);
        if (tileIndex === undefined) {
            console.error("The tile '" + tile + "' that you want to place doesn't exist.");
            return;
        }
        if (
            render &&
            tileIndex !== 0 &&
            this.isGpuTilemapLayer(phaserLayer) &&
            !phaserLayer.tileset.containsTileIndex(tileIndex)
        ) {
            console.warn(
                `Cannot place tile ${tileIndex} on GPU tile layer "${layer}" because it belongs to another tileset.`,
            );
            return;
        }

        this.gameMap.putTileInSourceLayer(tileIndex, x, y, layer);
        const runtimeLayer = this.gameMap.findLayer(layer);
        if (runtimeLayer?.type !== "tilelayer") return;
        const local = tileToLayerIndex(runtimeLayer, x, y);
        if (local.x < 0 || local.y < 0 || local.x >= runtimeLayer.width || local.y >= runtimeLayer.height) return;

        this.gameMap.putTileInFlatLayer(tileIndex, local.x, local.y, layer);
        const phaserTile =
            tileIndex === 0
                ? (phaserLayer.removeTileAt(local.x, local.y, false, false) ?? null)
                : phaserLayer.putTileAt(render ? tileIndex : -1, local.x, local.y);
        const tileProperties: readonly ITiledMapProperty[] =
            tileIndex === 0 ? [] : this.gameMap.getTileProperty(tileIndex);
        if (phaserTile !== null) {
            replacePhaserTileProperties(phaserTile, tileProperties);
            const hasAuthoringCollisionLayer = this.phaserLayers.some((candidate) =>
                isAuthoringCollisionLayer(candidate.layer.name),
            );
            const physicalCollisionMode = getPhysicalTileCollisionMode(layer, hasAuthoringCollisionLayer);
            if (physicalCollisionMode === "occupied") {
                phaserTile.resetCollision();
                if (tile !== null) phaserTile.setCollision(true);
            } else if (physicalCollisionMode === "disabled") {
                phaserTile.resetCollision();
            }
        }
        if (!options.deferRefresh) {
            if (this.isGpuTilemapLayer(phaserLayer)) phaserLayer.generateLayerDataTexture();
            this.invalidateCollisionGrid({ modifiedLayer: phaserLayer });
            this.refreshVoidCollisionCell(x, y);
        }
    }

    public refreshTileBatch(cells: readonly { layer: string; x: number; y: number }[], source: ITiledMap): void {
        const touchedLayers = new Set<RenderableTilemapLayer>();
        for (const cell of cells) {
            const layer = this.findPhaserLayer(cell.layer);
            if (layer !== undefined) touchedLayers.add(layer);
        }
        for (const layer of touchedLayers) {
            if (this.isGpuTilemapLayer(layer)) layer.generateLayerDataTexture();
            this.invalidateCollisionGrid({ modifiedLayer: layer });
        }

        const bounds = this.getRuntimeTileBounds();
        const coordinates = new Set(cells.map(({ x, y }) => `${x},${y}`));
        for (const coordinate of coordinates) {
            const separator = coordinate.indexOf(",");
            const tileX = Number(coordinate.slice(0, separator));
            const tileY = Number(coordinate.slice(separator + 1));
            const x = tileX - bounds.x;
            const y = tileY - bounds.y;
            if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) continue;
            this.setVoidCollisionCell(x, y, this.hasVisibleTileSupportAt(source.layers, tileX, tileY, ""));
        }
        this.voidCollisionLayer.setCollisionByProperty({ collides: true });
        this.invalidateCollisionGrid({ modifiedLayer: this.voidCollisionLayer });
    }

    private hasVisibleTileSupportAt(
        layers: readonly ITiledMapLayer[],
        tileX: number,
        tileY: number,
        prefix: string,
    ): boolean {
        for (const layer of layers) {
            const fullName = prefix + layer.name;
            if (layer.type === "group") {
                if (this.hasVisibleTileSupportAt(layer.layers, tileX, tileY, fullName + "/")) return true;
                continue;
            }
            if (
                layer.type === "tilelayer" &&
                isAvatarSupportingTileLayerName(fullName) &&
                (this.findPhaserLayer(fullName)?.visible ?? layer.visible) &&
                getTileLayerGid(layer, tileX, tileY) !== 0
            ) {
                return true;
            }
        }
        return false;
    }

    public containsOccupiedVisualTileDeletion(regions: readonly TeapotTileRegion[]): boolean {
        return containsOccupiedVisualTileDeletion(regions, this.getOccupiedAvatarTileCoordinates());
    }

    public isTileOccupiedByAvatar(x: number, y: number): boolean {
        return this.getOccupiedAvatarTileCoordinates().some((position) => position.x === x && position.y === y);
    }

    private getOccupiedAvatarTileCoordinates(): { x: number; y: number }[] {
        const map = this.gameMap.getMap();
        const positions: { x: number; y: number }[] = [];
        if (this.scene.CurrentPlayer !== undefined) {
            positions.push(worldToTileCoordinates(map, this.scene.CurrentPlayer.x, this.scene.CurrentPlayer.y));
        }
        for (const player of this.scene.MapPlayersByKey.values()) {
            positions.push(worldToTileCoordinates(map, player.x, player.y));
        }
        return positions;
    }

    public canEntityBePlacedOnMap(
        topLeftPos: { x: number; y: number },
        width: number,
        height: number,
        collisionRectangles: readonly EntityCollisionRectangle[] = [],
        excludedEntityId?: string,
        ignoreCollisionGrid?: boolean,
    ): boolean {
        const placementBounds = this.getEntityPlacementBounds(topLeftPos, width, height, collisionRectangles);
        if (
            this.isOutOfMapBounds(placementBounds.x, placementBounds.y, placementBounds.width, placementBounds.height)
        ) {
            return false;
        }

        if (collisionRectangles.length > 0) {
            if (this.overlapsPlayerCollision(collisionRectangles)) {
                return false;
            }
            if (
                !ignoreCollisionGrid &&
                (collisionRectangles.some((rectangle) => this.overlapsMapCollision(rectangle)) ||
                    this.entitiesManager.overlapsEntityCollision(collisionRectangles, excludedEntityId))
            ) {
                return false;
            }
        }

        const entityCenterCoordinates = {
            x: Math.ceil(placementBounds.x + placementBounds.width / 2),
            y: Math.ceil(placementBounds.y + placementBounds.height / 2),
        };

        return this.scene
            .getEntityPermissions()
            .canEdit(
                entityCenterCoordinates,
                placementBounds.width,
                placementBounds.height,
                collisionRectangles.length === 0,
            );
    }

    private getEntityPlacementBounds(
        topLeftPos: { x: number; y: number },
        width: number,
        height: number,
        collisionRectangles: readonly EntityCollisionRectangle[],
    ): EntityCollisionRectangle {
        if (collisionRectangles.length === 0) {
            return { x: topLeftPos.x, y: topLeftPos.y, width, height };
        }
        const left = Math.min(...collisionRectangles.map((rectangle) => rectangle.x));
        const top = Math.min(...collisionRectangles.map((rectangle) => rectangle.y));
        const right = Math.max(...collisionRectangles.map((rectangle) => rectangle.x + rectangle.width));
        const bottom = Math.max(...collisionRectangles.map((rectangle) => rectangle.y + rectangle.height));
        return { x: left, y: top, width: right - left, height: bottom - top };
    }

    private overlapsMapCollision(rectangle: EntityCollisionRectangle): boolean {
        this.ensureCollisionGridUpToDate(false);
        const origin = this.getCollisionGridBounds();
        const tileDimensions = this.getTileDimensions();
        const startX = Math.floor((rectangle.x - origin.x) / tileDimensions.width);
        const startY = Math.floor((rectangle.y - origin.y) / tileDimensions.height);
        const endX = Math.ceil((rectangle.x + rectangle.width - origin.x) / tileDimensions.width) - 1;
        const endY = Math.ceil((rectangle.y + rectangle.height - origin.y) / tileDimensions.height) - 1;
        for (let y = startY; y <= endY; y += 1) {
            for (let x = startX; x <= endX; x += 1) {
                if (this.collisionGrid[y]?.[x] !== 0) return true;
            }
        }
        return false;
    }

    private overlapsPlayerCollision(rectangles: readonly EntityCollisionRectangle[]): boolean {
        const players = [...this.scene.MapPlayersByKey.values(), this.scene.CurrentPlayer];
        return players.some((player) => {
            const body = player.body;
            if (!(body instanceof ArcadeBody)) return false;
            const playerRectangle = { x: body.x, y: body.y, width: body.width, height: body.height };
            return rectangles.some((rectangle) => collisionRectanglesOverlap(rectangle, playerRectangle));
        });
    }

    public isSpaceAvailable(topLeftX: number, topLeftY: number, ignoreCollisionGrid?: boolean): boolean {
        this.ensureCollisionGridUpToDate(false);
        if (this.collisionGrid.length === 0) {
            return false;
        }
        if (
            this.isOutOfMapBounds(topLeftX, topLeftY, this.getTileDimensions().width, this.getTileDimensions().height)
        ) {
            return false;
        }
        const playersPositions = [
            ...Array.from(this.scene.getRemotePlayersRepository().getPlayers().values()).map(
                (player) => player.position,
            ),
            this.scene.CurrentPlayer.getPosition(),
        ];

        // check if position is not occupied by a WOKA
        for (const position of playersPositions) {
            if (
                MathUtils.isOverlappingWithRectangle(position, {
                    x: topLeftX,
                    y: topLeftY,
                    width: this.getTileDimensions().width,
                    height: this.getTileDimensions().height,
                })
            ) {
                return false;
            }
        }

        if (ignoreCollisionGrid) {
            return true;
        }

        // Check if position is not colliding
        const height = this.collisionGrid.length;
        const width = this.collisionGrid[0].length;
        const origin = this.getCollisionGridBounds();
        const tileDimensions = this.getTileDimensions();
        const xIndex = Math.floor((topLeftX - origin.x) / tileDimensions.width);
        const yIndex = Math.floor((topLeftY - origin.y) / tileDimensions.height);
        if (yIndex >= height || yIndex < 0 || xIndex >= width || xIndex < 0) {
            return false;
        }
        if (this.collisionGrid[yIndex][xIndex] !== 0) {
            return false;
        }
        return true;
    }

    public isOutOfMapBounds(topLeftX: number, topLeftY: number, width = 0, height = 0): boolean {
        this.ensureCollisionGridUpToDate(false);
        if (this.collisionGrid.length === 0 || this.collisionGrid[0] === undefined) {
            return true;
        }
        const mapWidth = this.collisionGrid[0].length * this.getTileDimensions().width;
        const mapHeight = this.collisionGrid.length * this.getTileDimensions().height;
        const origin = this.getCollisionGridBounds();
        if (
            topLeftX < origin.x ||
            topLeftX + width > origin.x + mapWidth ||
            topLeftY < origin.y ||
            topLeftY + height > origin.y + mapHeight
        ) {
            return true;
        }
        return false;
    }

    public getMapBounds(): { x: number; y: number; width: number; height: number } {
        return this.gameMap.getMapBounds();
    }

    public setLayerProperty(
        layerName: string,
        propertyName: string,
        propertyValue: string | number | undefined | boolean,
    ) {
        const layer = this.findLayer(layerName);
        if (layer === undefined) {
            console.warn('Could not find layer "' + layerName + '" when calling setProperty');
            return;
        }
        this.gameMap.setTiledObjectProperty(layer, propertyName, propertyValue);
        this.triggerAllProperties();
        this.triggerLayersChange();
    }

    /**
     * Trigger all the callbacks (used when exiting a map)
     */
    public triggerExitCallbacks(): void {
        const emptyProps = new Map<string, string | boolean | number>();
        for (const [oldPropName, oldPropValue] of this.lastProperties.entries()) {
            // We found a property that disappeared
            this.trigger(oldPropName, oldPropValue, undefined, emptyProps);
        }

        this.gameMap.getWamFile()?.getGameMapAreas().triggerAreasChange(this.position, undefined);
    }

    public getRandomPositionFromLayer(layerName: string): { x: number; y: number } {
        const layer = this.findLayer(layerName) as ITiledMapTileLayer;
        if (!layer) {
            throw new Error(`No layer "${layerName}" was found`);
        }
        const tiles = layer.data;
        if (!tiles) {
            throw new Error(`No tiles in "${layerName}" were found`);
        }
        if (typeof tiles === "string") {
            throw new Error("The content of a JSON map must be filled as a JSON array, not as a string");
        }
        const possiblePositions: { x: number; y: number }[] = [];
        tiles.forEach((objectKey: number, key: number) => {
            if (objectKey === 0) {
                return;
            }
            possiblePositions.push({ x: key % layer.width, y: Math.floor(key / layer.width) });
        });
        if (possiblePositions.length > 0) {
            return MathUtils.randomFromArray(possiblePositions);
        }
        throw new Error(`No possible position found, layer "${layerName}" is empty`);
    }

    public getTiledObjectProperty(
        object: { properties?: ITiledMapProperty[] },
        propertyName: string,
    ): Json | undefined {
        return this.gameMap.getTiledObjectProperty(object, propertyName);
    }

    public getObjectWithName(name: string): ITiledMapObject | undefined {
        return this.gameMap.getObjectWithName(name);
    }

    public setDynamicAreaProperty(areaName: string, propertyName: string, propertyValue: unknown): void {
        const area = this.dynamicAreas.get(areaName);
        if (area === undefined) {
            console.warn('Could not find dynamic area "' + areaName + '" when calling setProperty');
            return;
        }
        area.properties[propertyName] = propertyValue;
        this.triggerAllProperties();
        this.triggerDynamicAreasChange(this.oldPosition, this.position);
    }

    public getAreas(): Map<string, AreaData> | undefined {
        return this.gameMap.getWamFile()?.getGameMapAreas().getAreas();
    }

    public addArea(area: AreaData): void {
        this.gameMap.getWamFile()?.getGameMapAreas().addArea(area, true, this.position);
    }

    public addDynamicArea(area: DynamicArea): boolean {
        if (this.dynamicAreas.has(area.name)) {
            return false;
        }
        this.dynamicAreas.set(area.name, area);

        // Trigger properties (in case the player is inside the new area)
        this.triggerAllProperties();

        return true;
    }

    public triggerSpecificAreaOnEnter(area: AreaData): void {
        this.gameMap.getWamFile()?.getGameMapAreas().triggerSpecificAreaOnEnter(area);
    }

    public triggerSpecificAreaOnUpdate(
        area: AreaData,
        oldProperties: AreaDataProperties | undefined,
        newProperties: AreaDataProperties | undefined,
    ): void {
        this.gameMap.getWamFile()?.getGameMapAreas().triggerSpecificAreaOnUpdate(area, oldProperties, newProperties);
    }

    public triggerSpecificAreaOnLeave(area: AreaData): void {
        this.gameMap.getWamFile()?.getGameMapAreas().triggerSpecificAreaOnLeave(area);
    }

    public getAreaByName(name: string): AreaData | undefined {
        return this.gameMap.getWamFile()?.getGameMapAreas().getAreaByName(name);
    }

    public getArea(id: string): AreaData | undefined {
        return this.gameMap.getWamFile()?.getGameMapAreas().getArea(id);
    }

    public getDynamicArea(name: string): DynamicArea | undefined {
        return this.dynamicAreas.get(name);
    }

    public deleteDynamicArea(name: string): void {
        this.dynamicAreas.delete(name);
    }

    private isPlayerInsideAreaByCoordinates(
        areaCoordinates: { x: number; y: number; width: number; height: number },
        playerPosition: { x: number; y: number },
    ): boolean {
        return this.isInsideAreaByCoordinates(areaCoordinates, playerPosition);
    }

    public listenAreaCreation(areaData: AreaData): void {
        if (this.position === undefined) {
            return;
        }

        if (this.isPlayerInsideAreaByCoordinates(areaData, this.position)) {
            this.triggerSpecificAreaOnEnter(areaData);
        }

        if (!this.areasManager) {
            throw new Error("AreasManager is not initialized. Are you on a public map?");
        }
        this.areasManager.addArea(areaData);

        // Update cache if area has maxUsersInAreaPropertyData
        if (this.areaHasMaxUsersProperty(areaData)) {
            this.areasWithMaxUsersProperty.add(areaData.id);
        }
    }

    public listenAreaChanges(oldConfig: AtLeast<AreaData, "id">, newConfig: AtLeast<AreaData, "id">): void {
        if (this.position === undefined) {
            return;
        }

        const isOldCoordinates = AreaCoordinates.safeParse(oldConfig);
        const isNewCoordinates = AreaCoordinates.safeParse(newConfig);

        if (!isOldCoordinates.success) {
            throw new Error("Something wrong happen! Area coordinates are not defined");
        }

        const area = this.gameMap.getWamFile()?.getGameMapAreas().getArea(oldConfig.id);

        if (!area) {
            console.error("Area with id " + oldConfig.id + " does not exist, this not supposed to happen");
            return;
        }

        const oldAreaCoordinates = isOldCoordinates.data;
        const newAreaCoordinates = isNewCoordinates.success ? isNewCoordinates.data : oldAreaCoordinates;

        const isPlayerWasInsideArea = this.isPlayerInsideAreaByCoordinates(oldAreaCoordinates, this.position);
        const isPlayerInsideArea = this.isPlayerInsideAreaByCoordinates(newAreaCoordinates, this.position);

        if (isPlayerWasInsideArea && isPlayerInsideArea) {
            if (JSON.stringify(oldConfig.properties) !== JSON.stringify(newConfig.properties)) {
                this.triggerSpecificAreaOnUpdate(area, oldConfig.properties, newConfig.properties);
            }
        } else if (isPlayerWasInsideArea && !isPlayerInsideArea) {
            this.triggerSpecificAreaOnLeave(area);
            return;
        } else if (!isPlayerWasInsideArea && isPlayerInsideArea) {
            this.triggerSpecificAreaOnEnter(area);
            return;
        }
        if (!this.areasManager) {
            throw new Error("AreasManager is not initialized. Are you on a public map?");
        }
        this.areasManager.updateArea(newConfig);

        // Update cache if maxUsersInAreaPropertyData was added or removed
        if (newConfig.properties) {
            const hasMaxUsersProperty = newConfig.properties.some(
                (property) => property.type === "maxUsersInAreaPropertyData",
            );
            if (hasMaxUsersProperty) {
                this.areasWithMaxUsersProperty.add(newConfig.id);
            } else {
                this.areasWithMaxUsersProperty.delete(newConfig.id);
            }
        }
    }

    public listenAreaDeletion(areaData: AreaData | undefined) {
        if (areaData === undefined || this.position === undefined) {
            console.error('Area with id "' + areaData?.id + '" does not exist, this not supposed to happen');
            return;
        }

        if (this.isPlayerInsideAreaByCoordinates(areaData, this.position)) {
            this.triggerSpecificAreaOnLeave(areaData);
        }
        if (!this.areasManager) {
            throw new Error("AreasManager is not initialized. Are you on a public map?");
        }
        this.areasManager.removeArea(areaData.id);

        // Remove from cache
        this.areasWithMaxUsersProperty.delete(areaData.id);
    }

    public getMapChangedObservable(): Observable<number[][]> {
        return this.mapChangedSubject.asObservable();
    }

    public getFlatLayers(): ITiledMapLayer[] {
        return this.gameMap.flatLayers;
    }

    public getExitUrls(): Array<string> {
        return this.gameMap.exitUrls;
    }

    public hasStartTile(): boolean {
        return this.gameMap.hasStartTile;
    }

    public getGameMap(): GameMap {
        return this.gameMap;
    }

    public getEntitiesManager(): EntitiesManager {
        return this.entitiesManager;
    }

    public getActivatableEntities(): Entity[] {
        return this.entitiesManager.getActivatableEntities();
    }

    public handleEntityActionTrigger(): void {
        this.triggerAllProperties();
    }

    /**
     * Parse map-editor AreaData to ITiledMapObject format in order to handle properties changes
     */
    public mapAreaToTiledObject(areaData: AreaData): ITiledPlace {
        return {
            id: areaData.id,
            type: "area",
            class: "area",
            name: areaData.name,
            visible: true,
            x: areaData.x,
            y: areaData.y,
            width: areaData.width,
            height: areaData.height,
            properties: this.mapAreaPropertiesToTiledProperties(areaData.properties),
        };
    }

    public mapDynamicAreaToTiledObject(dynamicArea: DynamicArea): ITiledPlace {
        return {
            id: dynamicArea.name,
            type: "area",
            class: "area",
            name: dynamicArea.name,
            visible: true,
            x: dynamicArea.x,
            y: dynamicArea.y,
            width: dynamicArea.width,
            height: dynamicArea.height,
            properties: this.mapDynamicAreaPropertiesToTiledProperties(dynamicArea.properties),
        };
    }

    private mapDynamicAreaPropertiesToTiledProperties(dynamicAreaProperties: {
        [key: string]: unknown;
    }): ITiledMapProperty[] {
        const properties: ITiledMapProperty[] = [];
        for (const key in dynamicAreaProperties) {
            const property = dynamicAreaProperties[key];
            if (typeof property === "string") {
                properties.push({ name: key, type: "string", value: property });
                continue;
            }
            if (typeof property === "number") {
                properties.push({ name: key, type: "float", value: property });
                continue;
            }
            if (typeof property === "boolean") {
                properties.push({ name: key, type: "bool", value: property });
                continue;
            }
        }
        return properties;
    }

    private mapTiledPropertiesToDynamicAreaProperties(tiledProperties: ITiledMapProperty[]): {
        [key: string]: unknown;
    } {
        const properties: { [key: string]: unknown } = {};
        for (const tiledProperty of tiledProperties) {
            properties[tiledProperty.name] = tiledProperty.value;
        }
        return properties;
    }

    private mapAreaPropertiesToTiledProperties(areaProperties: AreaDataProperties): ITiledMapProperty[] {
        const properties: ITiledMapProperty[] = [];

        for (const property of areaProperties) {
            switch (property.type) {
                case "focusable": {
                    properties.push({ name: GameMapProperties.FOCUSABLE, type: "bool", value: true });
                    if (property.zoom_margin) {
                        properties.push({
                            name: GameMapProperties.ZOOM_MARGIN,
                            type: "float",
                            value: property.zoom_margin,
                        });
                    }
                    break;
                }
                // TODO: consider whether to also add the properties of livekitRoomProperty
                case "jitsiRoomProperty": {
                    properties.push({
                        name: GameMapProperties.JITSI_ROOM,
                        type: "string",
                        value: property.roomName ?? "",
                    });
                    if (property.jitsiRoomConfig) {
                        properties.push({
                            name: GameMapProperties.JITSI_CONFIG,
                            type: "class",
                            value: property.jitsiRoomConfig,
                        });
                    }
                    break;
                }
                case "openWebsite": {
                    if (property.newTab) {
                        properties.push({
                            name: GameMapProperties.OPEN_TAB,
                            type: "string",
                            value: property.link ?? undefined,
                        });
                    } else {
                        properties.push({
                            name: GameMapProperties.OPEN_WEBSITE,
                            type: "string",
                            value: property.link ?? undefined,
                        });
                    }
                    break;
                }
                case "playAudio": {
                    properties.push({
                        name: GameMapProperties.PLAY_AUDIO,
                        type: "string",
                        value: property.audioLink,
                    });
                    break;
                }
                case "silent": {
                    properties.push({
                        name: GameMapProperties.SILENT,
                        type: "bool",
                        value: true,
                    });
                    break;
                }
                case "start": {
                    properties.push({
                        name: GameMapProperties.START,
                        type: "bool",
                        value: true,
                    });
                    break;
                }
                case "speakerMegaphone": {
                    properties.push({
                        name: GameMapProperties.SPEAKER_MEGAPHONE,
                        type: "string",
                        value: `${property.id}-${property.name}`,
                    });
                    break;
                }
                case "listenerMegaphone": {
                    properties.push({
                        name: GameMapProperties.LISTENER_MEGAPHONE,
                        type: "string",
                        value: property.speakerZoneName,
                    });
                }
            }
        }
        return properties;
    }

    public triggerAllProperties(): void {
        if (this.key === undefined) return;
        const newProps = this.getProperties(this.key);
        const oldProps = this.lastProperties;
        this.lastProperties = newProps;

        // Let's compare the 2 maps:
        // First new properties vs oldProperties
        for (const [newPropName, newPropValue] of newProps.entries()) {
            const oldPropValue = oldProps.get(newPropName);
            if (oldPropValue !== newPropValue) {
                this.trigger(newPropName, oldPropValue, newPropValue, newProps);
            }
        }

        for (const [oldPropName, oldPropValue] of oldProps.entries()) {
            if (!newProps.has(oldPropName)) {
                // We found a property that disappeared
                this.trigger(oldPropName, oldPropValue, undefined, newProps);
            }
        }
    }

    private getLayerCollisionGrid(layer: RenderableTilemapLayer): (1 | 2 | 3 | 0)[][] {
        let isExitLayer = false;
        const isStartLayer = layer.layer.name === "start";
        for (const property of layer.layer.properties as { [key: string]: string | number | boolean }[]) {
            if (property.name && property.name === "exitUrl") {
                isExitLayer = true;
            }
        }

        return layer.layer.data.map((row) =>
            row.map((tile) => {
                if (tile === null) {
                    return 0;
                }

                return tile.properties?.[GameMapProperties.COLLIDES]
                    ? 1
                    : (isExitLayer && tile.index !== -1) ||
                        tile.properties?.[GameMapProperties.EXIT_URL] ||
                        tile.properties?.[GameMapProperties.EXIT_SCENE_URL]
                      ? 2
                      : (isStartLayer && tile.index !== -1) ||
                          tile.properties?.[GameMapProperties.START] ||
                          tile.properties?.[GameMapProperties.START_LAYER]
                        ? 3
                        : 0;
            }),
        );
    }

    /**
     * Return properties attached to the given tile key (properties from the Tiled tile layer + properties attached
     * to the tileset tile + properties attached to the activated entities (if any) + properties attached to the dynamic
     * areas.
     */
    private getProperties(key: number): Map<string, string | boolean | number> {
        const properties = new Map<string, string | boolean | number>();
        // NOTE: WE DO NOT WANT AREAS TO BE THE PART OF THE OLD PROPERTIES CHANGE SYSTEM
        // CHECK FOR AREAS PROPERTIES
        //if (this.position) {
        //    const areasProperties = this.gameMap.getWamFile()?.getGameMapAreas().getProperties(this.position);
        //    if (areasProperties) {
        //        for (const [key, value] of areasProperties) {
        //            properties.set(key, value);
        //        }
        //    }
        //}

        // CHECK FOR DYNAMIC AREAS PROPERTIES
        if (this.position) {
            const dynamicAreasProperties = this.getDynamicAreasProperties(this.position);
            if (dynamicAreasProperties) {
                for (const [key, value] of dynamicAreasProperties) {
                    properties.set(key, value);
                }
            }
        }

        // CHECK FOR ENTITIES PROPERTIES
        if (this.entitiesManager) {
            for (const [key, value] of this.entitiesManager.getProperties()) {
                properties.set(key, value);
            }
        }

        // CHECK FOR LAYERS PROPERTIES
        for (const layer of this.gameMap.getLayersByKey(key)) {
            if (layer.type !== "tilelayer") continue;
            const tileIndex = this.gameMap.getTileInSourceLayerByKey(key, layer.name);
            if (!tileIndex) continue;

            // There is a tile in this layer, let's embed the properties
            if (layer.properties !== undefined) {
                for (const layerProperty of layer.properties) {
                    if (layerProperty.value === undefined) {
                        continue;
                    }
                    properties.set(layerProperty.name, layerProperty.value as string | number | boolean);
                }
            }

            if (tileIndex) {
                this.gameMap.getTileProperty(tileIndex).forEach((property) => {
                    if (property.value) {
                        properties.set(property.name, property.value as string | number | boolean);
                    } else if (properties.has(property.name)) {
                        properties.delete(property.name);
                    }
                });
            }
        }
        return properties;
    }

    private trigger(
        propName: string,
        oldValue: string | number | boolean | undefined,
        newValue: string | number | boolean | undefined,
        allProps: Map<string, string | boolean | number>,
    ) {
        const callbacksArray = this.propertiesChangeCallbacks.get(propName);
        if (callbacksArray !== undefined) {
            for (const callback of callbacksArray) {
                callback(newValue, oldValue, allProps);
            }
        }
    }

    private triggerLayersChange(): void {
        const layersByOldKey = this.oldKey === undefined ? [] : this.gameMap.getLayersByKey(this.oldKey);
        const layersByNewKey = this.key === undefined ? [] : this.gameMap.getLayersByKey(this.key);

        const enterLayers = new Set(layersByNewKey);
        const leaveLayers = new Set(layersByOldKey);

        enterLayers.forEach((layer) => {
            if (leaveLayers.has(layer)) {
                leaveLayers.delete(layer);
                enterLayers.delete(layer);
            }
        });

        if (enterLayers.size > 0) {
            const layerArray = Array.from(enterLayers);
            for (const callback of this.enterLayerCallbacks) {
                callback(layerArray, layersByNewKey);
            }
        }

        if (leaveLayers.size > 0) {
            const layerArray = Array.from(leaveLayers);
            for (const callback of this.leaveLayerCallbacks) {
                callback(layerArray, layersByNewKey);
            }
        }
    }

    private triggerDynamicAreasChange(
        oldPosition: { x: number; y: number } | undefined,
        position: { x: number; y: number } | undefined,
    ): boolean {
        const areasByOldPosition = oldPosition ? this.getDynamicAreasOnPosition(oldPosition) : [];
        const areasByNewPosition = position ? this.getDynamicAreasOnPosition(position) : [];

        const enterAreas = new Set(areasByNewPosition);
        const leaveAreas = new Set(areasByOldPosition);

        enterAreas.forEach((area) => {
            if (leaveAreas.has(area)) {
                leaveAreas.delete(area);
                enterAreas.delete(area);
            }
        });

        let areasChange = false;
        if (enterAreas.size > 0) {
            const areasArray = Array.from(enterAreas);

            for (const callback of this.enterDynamicAreaCallbacks) {
                callback(areasArray, areasByNewPosition);
            }
            areasChange = true;
        }

        if (leaveAreas.size > 0) {
            const areasArray = Array.from(leaveAreas);
            for (const callback of this.leaveDynamicAreaCallbacks) {
                callback(areasArray, areasByNewPosition);
            }
            areasChange = true;
        }
        return areasChange;
    }

    public getDynamicAreasOnPosition(position: { x: number; y: number }, offsetY = 16): DynamicArea[] {
        const overlappedDynamicAreas: DynamicArea[] = [];
        for (const dynamicArea of this.dynamicAreas.values()) {
            if (
                MathUtils.isOverlappingWithRectangle(
                    { x: position.x, y: position.y + offsetY },
                    { x: dynamicArea.x, y: dynamicArea.y, width: dynamicArea.width, height: dynamicArea.height },
                )
            ) {
                overlappedDynamicAreas.push(dynamicArea);
            }
        }
        return overlappedDynamicAreas;
    }

    private getDynamicAreasProperties(position: { x: number; y: number }): Map<string, string | number | boolean> {
        const properties = new Map<string, string | number | boolean>();
        for (const dynamicArea of this.getDynamicAreasOnPosition(position, 16)) {
            if (dynamicArea.properties === undefined) {
                continue;
            }
            for (const key in dynamicArea.properties) {
                const property = dynamicArea.properties[key];
                if (property === undefined) {
                    continue;
                }
                if (typeof property === "string" || typeof property === "number" || typeof property === "boolean") {
                    properties.set(key, property);
                }
            }
        }
        return properties;
    }

    public isInsideAreaByCoordinates(
        areaCoordinates: { x: number; y: number; width: number; height: number },
        objectCoordinates: { x: number; y: number },
    ) {
        return MathUtils.isOverlappingWithRectangle(objectCoordinates, areaCoordinates);
    }

    public getCurrentLayers(): Array<ITiledMapLayer> {
        if (this.key === undefined) {
            return [];
        }
        return this.gameMap.getLayersByKey(this.key);
    }

    public getStartPositionNames(): string[] {
        const names: string[] = [];
        for (const obj of this.getFlatLayers()) {
            if (obj.name === "start") {
                names.push(obj.name);
                continue;
            }
            if (this.isStartObject(obj)) {
                names.push(obj.name);
            }
        }

        for (const dynamicArea of this.dynamicAreas.values()) {
            if (dynamicArea.name === "start") {
                names.push(dynamicArea.name);
                continue;
            }
            const properties = dynamicArea.properties;
            if (properties && properties[GameMapProperties.START] === true) {
                names.push(dynamicArea.name);
            }
        }

        const areas = this.getAreas();

        if (areas) {
            for (const area of Array.from(areas.values())) {
                if (area.name === "start" || area.properties.find((property) => property.type === "start")) {
                    names.push(area.name);
                }
            }
        }
        return names;
    }

    public isStartObject(obj: ITiledMapLayer | ITiledMapObject): boolean {
        if (this.getTiledObjectProperty(obj, GameMapProperties.START) == true) {
            return true;
        }
        // legacy reasons
        return this.getTiledObjectProperty(obj, GameMapProperties.START_LAYER) == true;
    }

    public close() {
        this.entitiesManager.close();
        this.areasManager?.destroy();
    }
}
