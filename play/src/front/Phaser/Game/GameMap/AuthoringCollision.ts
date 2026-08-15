import {
    compactTeapotTileRegions,
    forEachTileInLayer,
    GameMapProperties,
    getMapTileBounds,
    isAvatarSupportingTileLayerName,
    WATER_UNDERLAY_LAYER_PREFIX,
    type TeapotTileRegion,
} from "@workadventure/map-editor";
import type { ITiledMap, ITiledMapLayer, ITiledMapTileLayer } from "@workadventure/tiled-map-type-guard";

import { getBuiltInTerrainAssetsForTileset, getBuiltInTerrainTileset } from "../../../Services/BuiltInTerrainCatalog";
import { PathTileType } from "../../../Utils/PathfindingManager";

export type CollisionGridCell = PathTileType.Walkable | PathTileType.Collider | PathTileType.Exit | PathTileType.Start;

export interface CollisionGridLayer {
    kind: "regular" | "authoring-collision" | "dynamic-collision";
    visible: boolean;
    grid: readonly (readonly CollisionGridCell[])[];
}

export type AuthoringPathOverlayKind = "collision" | "exit" | "start";
export type PhysicalTileCollisionMode = "occupied" | "properties" | "disabled";

export interface AuthoringPathOverlay {
    kind: AuthoringPathOverlayKind;
    cells: readonly { x: number; y: number }[];
}

export { containsOccupiedVisualTileDeletion } from "@workadventure/map-editor";

const AUTHORING_COLLISION_LAYER_NAMES = new Set(["collision", "collisions", "collision1", "collisions1"]);
const LEGACY_COLLISION_LAYER_NAMES = new Set(["collision2", "collisions2"]);
const AUTHORING_EXIT_LAYER_NAMES = new Set(["exit"]);
const AUTHORING_START_LAYER_NAMES = new Set(["start", "start1"]);
const RUNTIME_COLLISION_LAYER_NAMES = new Set(["entitiescollisionlayer", "areascollisionlayer", "voidcollisionlayer"]);

export function isAuthoringCollisionLayer(name: string): boolean {
    return AUTHORING_COLLISION_LAYER_NAMES.has(normalizeLayerName(name));
}

/** Collision layers store cell state and must never be rendered as visual terrain. */
export function isCollisionStorageLayer(name: string): boolean {
    const normalizedLayerName = normalizeLayerName(name);
    return (
        AUTHORING_COLLISION_LAYER_NAMES.has(normalizedLayerName) ||
        LEGACY_COLLISION_LAYER_NAMES.has(normalizedLayerName)
    );
}

/**
 * A primary authoring collision layer replaces persisted per-tile collision metadata as the map-level source of
 * truth. Synthetic runtime collision layers remain additive and maps without an authoring layer keep legacy tile
 * property behavior.
 */
export function getPhysicalTileCollisionMode(
    layerName: string,
    hasAuthoringCollisionLayer: boolean,
): PhysicalTileCollisionMode {
    if (isAuthoringCollisionLayer(layerName)) return "occupied";
    if (RUNTIME_COLLISION_LAYER_NAMES.has(normalizeLayerName(layerName))) return "properties";
    return hasAuthoringCollisionLayer ? "disabled" : "properties";
}

export function getAuthoringPathOverlayKind(layerName: string): AuthoringPathOverlayKind | undefined {
    const normalizedLayerName = normalizeLayerName(layerName);
    return AUTHORING_COLLISION_LAYER_NAMES.has(normalizedLayerName)
        ? "collision"
        : AUTHORING_EXIT_LAYER_NAMES.has(normalizedLayerName)
          ? "exit"
          : AUTHORING_START_LAYER_NAMES.has(normalizedLayerName)
            ? "start"
            : undefined;
}

/** Returns whether a persisted tile layer represents visible terrain that can support an avatar. */
export function isVisualTileLayerName(layerName: string): boolean {
    return isAvatarSupportingTileLayerName(layerName);
}

/** Builds a map-aligned grid whose cells are true when any visible visual tile layer contains a nonzero GID. */
export function getTileSupportGrid(map: ITiledMap): boolean[][] {
    const bounds = getMapTileBounds(map);
    const grid = Array.from({ length: bounds.height }, () => Array<boolean>(bounds.width).fill(false));

    for (const layer of flattenVisibleTileLayers(map.layers)) {
        if (!isVisualTileLayerName(layer.name)) continue;
        forEachTileInLayer(layer, (gid, tileX, tileY) => {
            if (gid === 0) return;
            const x = tileX - bounds.minX;
            const y = tileY - bounds.minY;
            if (x >= 0 && y >= 0 && x < bounds.width && y < bounds.height) grid[y][x] = true;
        });
    }

    return grid;
}

/**
 * A dedicated authoring collision layer is the map-level source of truth. This lets an empty cell explicitly
 * override collidable tiles in any visual layer below or above it. Maps without such a layer keep legacy behavior.
 */
export function composeCollisionGrid(
    width: number,
    height: number,
    layers: readonly CollisionGridLayer[],
): CollisionGridCell[][] {
    const result: CollisionGridCell[][] = Array.from({ length: height }, () =>
        Array<CollisionGridCell>(width).fill(PathTileType.Walkable),
    );
    const regularLayers = layers.filter((layer) => layer.kind === "regular" && layer.visible);
    const authoringLayers = layers.filter((layer) => layer.kind === "authoring-collision");
    const dynamicLayers = layers.filter((layer) => layer.kind === "dynamic-collision");

    mergeLayerGrids(result, regularLayers);

    if (authoringLayers.length > 0) {
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                if (result[y][x] === PathTileType.Collider) result[y][x] = PathTileType.Walkable;
            }
        }
        mergeLayerGrids(result, authoringLayers);
    }

    mergeLayerGrids(result, dynamicLayers);
    return result;
}

export function findCollisionLayer(map: ITiledMap): ITiledMapLayer | undefined {
    return flattenLayers(map.layers).find(
        (layer) => layer.type === "tilelayer" && isAuthoringCollisionLayer(layer.name),
    );
}

export function findCollisionBrushGid(map: ITiledMap, collisionLayerName: string): number | undefined {
    const collidableGids = getCollidableGids(map);
    const collisionLayer = flattenLayers(map.layers).find(
        (layer) => layer.type === "tilelayer" && layer.name === collisionLayerName,
    );
    if (collisionLayer?.type === "tilelayer") {
        let existingGid: number | undefined;
        let existingCollidableGid: number | undefined;
        forEachTileInLayer(collisionLayer, (gid) => {
            if (gid === 0) return;
            existingGid ??= gid;
            if (existingCollidableGid === undefined && collidableGids.has(stripTileFlags(gid))) {
                existingCollidableGid = gid;
            }
        });
        if (existingCollidableGid !== undefined) return stripTileFlags(existingCollidableGid);
        if (existingGid !== undefined) return stripTileFlags(existingGid);
    }
    return (
        collidableGids.values().next().value ?? map.tilesets.find((tileset) => tileset.firstgid !== undefined)?.firstgid
    );
}

/** Builds collision state directly from occupied cells in the canonical map layer, never from visual tile metadata. */
export function getAuthoringCollisionGrid(map: ITiledMap): CollisionGridCell[][] {
    const bounds = getMapTileBounds(map);
    const grid: CollisionGridCell[][] = Array.from({ length: bounds.height }, () =>
        Array<CollisionGridCell>(bounds.width).fill(PathTileType.Walkable),
    );
    const collisionLayer = findCollisionLayer(map);
    if (collisionLayer?.type !== "tilelayer") return grid;

    forEachTileInLayer(collisionLayer, (gid, tileX, tileY) => {
        if (gid === 0) return;
        const x = tileX - bounds.minX;
        const y = tileY - bounds.minY;
        if (x >= 0 && y >= 0 && x < bounds.width && y < bounds.height) {
            grid[y][x] = PathTileType.Collider;
        }
    });
    return grid;
}

export function findAuthoringPathBrushGid(map: ITiledMap, layerName: string): number | undefined {
    const kind = getAuthoringPathOverlayKind(layerName);
    if (kind === undefined) return undefined;
    if (kind === "collision") return findCollisionBrushGid(map, layerName);

    const layer = flattenLayers(map.layers).find(
        (candidate) => candidate.type === "tilelayer" && candidate.name === layerName,
    );
    if (layer?.type !== "tilelayer") return undefined;
    let existingGid: number | undefined;
    forEachTileInLayer(layer, (gid) => {
        if (existingGid === undefined && gid !== 0) existingGid = gid;
    });
    return existingGid === undefined ? undefined : stripTileFlags(existingGid);
}

export function tileHasDefaultCollision(map: ITiledMap, gid: number): boolean {
    const normalizedGid = stripTileFlags(gid);
    if (getCollidableGids(map).has(normalizedGid)) return true;
    return map.tilesets.some((tileset) => {
        if (
            tileset.firstgid === undefined ||
            !("image" in tileset) ||
            typeof tileset.image !== "string" ||
            getBuiltInTerrainTileset(tileset.image) === undefined
        ) {
            return false;
        }
        const builtInTileset = getBuiltInTerrainTileset(tileset.image);
        if (builtInTileset === undefined) return false;
        const tileId = normalizedGid - tileset.firstgid;
        return getBuiltInTerrainAssetsForTileset(builtInTileset.id).some(
            (asset) => asset.tileId === tileId && asset.solid,
        );
    });
}

export function appendDefaultCollisionRegions(
    map: ITiledMap,
    regions: readonly TeapotTileRegion[],
): readonly TeapotTileRegion[] {
    const collisionLayer = findCollisionLayer(map);
    if (collisionLayer === undefined) return regions;
    const collisionGid = findCollisionBrushGid(map, collisionLayer.name);
    if (collisionGid === undefined) return regions;
    const collisionRegions: TeapotTileRegion[] = [];
    for (const region of regions) {
        if (
            getAuthoringPathOverlayKind(region.layer) !== undefined ||
            region.layer.startsWith(WATER_UNDERLAY_LAYER_PREFIX)
        )
            continue;
        for (let y = 0; y < region.height; y += 1) {
            for (let x = 0; x < region.width; x += 1) {
                const gid = region.gids[y * region.width + x] ?? 0;
                if (!tileHasDefaultCollision(map, gid)) continue;
                collisionRegions.push({
                    layer: collisionLayer.name,
                    x: region.x + x,
                    y: region.y + y,
                    width: 1,
                    height: 1,
                    gids: [collisionGid],
                });
            }
        }
    }
    return compactTeapotTileRegions([...regions, ...collisionRegions]);
}

export function appendWaterCollisionRegions(
    map: ITiledMap,
    regions: readonly TeapotTileRegion[],
    visibleWater: readonly { x: number; y: number }[],
): readonly TeapotTileRegion[] {
    const collisionLayer = findCollisionLayer(map);
    if (collisionLayer === undefined) return regions;
    const collisionGid = findCollisionBrushGid(map, collisionLayer.name);
    if (collisionGid === undefined) return regions;
    return compactTeapotTileRegions([
        ...regions,
        ...visibleWater.map(({ x, y }) => ({
            layer: collisionLayer.name,
            x,
            y,
            width: 1,
            height: 1,
            gids: [collisionGid],
        })),
    ]);
}

export function getCollisionOverlayCells(
    map: ITiledMap,
    collisionLayerName: string,
): readonly { x: number; y: number }[] {
    const layer = flattenLayers(map.layers).find(
        (candidate) => candidate.type === "tilelayer" && candidate.name === collisionLayerName,
    );
    if (layer?.type !== "tilelayer") return [];
    const cells: { x: number; y: number }[] = [];
    forEachTileInLayer(layer, (gid, x, y) => {
        if (gid !== 0) cells.push({ x, y });
    });
    return cells;
}

export function getAuthoringPathOverlay(map: ITiledMap, layerName: string): AuthoringPathOverlay | undefined {
    const kind = getAuthoringPathOverlayKind(layerName);
    if (kind === undefined) return undefined;

    const layer = flattenLayers(map.layers).find(
        (candidate) => candidate.type === "tilelayer" && candidate.name === layerName,
    );
    if (layer?.type !== "tilelayer") return undefined;
    if (kind === "collision") return { kind, cells: getCollisionOverlayCells(map, layerName) };

    const cells: { x: number; y: number }[] = [];
    forEachTileInLayer(layer, (gid, x, y) => {
        if (gid !== 0) cells.push({ x, y });
    });
    return { kind, cells };
}

function mergeLayerGrids(result: CollisionGridCell[][], layers: readonly CollisionGridLayer[]): void {
    for (const layer of layers) {
        for (let y = 0; y < result.length; y += 1) {
            for (let x = 0; x < result[y].length; x += 1) {
                const next = layer.grid[y]?.[x] ?? PathTileType.Walkable;
                if (
                    (result[y][x] === PathTileType.Exit || result[y][x] === PathTileType.Start) &&
                    next === PathTileType.Collider
                ) {
                    result[y][x] = next;
                } else if (result[y][x] === PathTileType.Walkable) {
                    result[y][x] = next;
                }
            }
        }
    }
}

function getCollidableGids(map: ITiledMap): Set<number> {
    const gids = new Set<number>();
    for (const tileset of map.tilesets) {
        if (!("tiles" in tileset) || tileset.firstgid === undefined) continue;
        for (const tile of tileset.tiles ?? []) {
            if (tile.properties?.some((property) => property.name === GameMapProperties.COLLIDES && property.value)) {
                gids.add(tileset.firstgid + tile.id);
            }
        }
    }
    return gids;
}

function flattenLayers(layers: readonly ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => [layer, ...(layer.type === "group" ? flattenLayers(layer.layers) : [])]);
}

function flattenVisibleTileLayers(layers: readonly ITiledMapLayer[], ancestorsVisible = true): ITiledMapTileLayer[] {
    return layers.flatMap((layer) => {
        const visible = ancestorsVisible && layer.visible !== false;
        if (layer.type === "group") return flattenVisibleTileLayers(layer.layers, visible);
        return visible && layer.type === "tilelayer" ? [layer] : [];
    });
}

function stripTileFlags(gid: number): number {
    return gid & ~0xe0000000;
}

function normalizeLayerName(name: string): string {
    return name.toLowerCase().replace(/[\s/_-]+/g, "");
}
