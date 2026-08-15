import type { WallPlacementOrientation } from "../types";

export const WALL_TILE_SIZE = 32;
export const WALL_MAX_DRAG_TILES = 256;
export const WALL_DEFAULT_WIDTH_TILES = 2;
export const WALL_DEFAULT_HEIGHT_TILES = 2;
export const WALL_DIAGONAL_WIDTH_TILES = 1;
export const WALL_VERTICAL_WIDTH_TILES = 0;
export const WALL_EDGE_RENDER_WIDTH = 1;
export const WALL_PLACEMENT_ORIENTATION_CYCLE = [
    "horizontal",
    "diagonal-down",
    "vertical",
    "diagonal-up",
] as const satisfies readonly WallPlacementOrientation[];

export type WallTile = { x: number; y: number };

export function isDiagonalWallOrientation(orientation: WallPlacementOrientation): boolean {
    return orientation === "diagonal-up" || orientation === "diagonal-down";
}

export function getNextWallPlacementOrientation(orientation: WallPlacementOrientation): WallPlacementOrientation {
    const index = WALL_PLACEMENT_ORIENTATION_CYCLE.indexOf(orientation);
    return WALL_PLACEMENT_ORIENTATION_CYCLE[(index + 1) % WALL_PLACEMENT_ORIENTATION_CYCLE.length] ?? "horizontal";
}

export function getWallPlacementSize(
    orientation: WallPlacementOrientation,
    standardWidthInTiles = WALL_DEFAULT_WIDTH_TILES,
    heightInTiles = WALL_DEFAULT_HEIGHT_TILES,
): { widthInTiles: number; heightInTiles: number } {
    const widthInTiles =
        orientation === "vertical"
            ? WALL_VERTICAL_WIDTH_TILES
            : isDiagonalWallOrientation(orientation)
              ? WALL_DIAGONAL_WIDTH_TILES
              : Math.max(1, standardWidthInTiles);
    return {
        widthInTiles,
        heightInTiles: Math.max(1, heightInTiles),
    };
}

export function getWallRenderSize(
    orientation: WallPlacementOrientation,
    standardWidthInTiles = WALL_DEFAULT_WIDTH_TILES,
    heightInTiles = WALL_DEFAULT_HEIGHT_TILES,
): { width: number; height: number } {
    const placementSize = getWallPlacementSize(orientation, standardWidthInTiles, heightInTiles);
    const width =
        placementSize.widthInTiles === 0
            ? WALL_EDGE_RENDER_WIDTH
            : Math.max(1, Math.round(placementSize.widthInTiles * WALL_TILE_SIZE));
    const baseHeight = Math.max(1, Math.round(placementSize.heightInTiles * WALL_TILE_SIZE));
    return {
        width,
        height: baseHeight + (isDiagonalWallOrientation(orientation) ? getWallProjectionRise(width) : 0),
    };
}

export function getWallTopLeftPosition(
    tile: WallTile,
    orientation: WallPlacementOrientation,
): { x: number; y: number } {
    const upwardRise = orientation === "diagonal-up" ? getWallProjectionRise(WALL_TILE_SIZE) : 0;
    return {
        x: tile.x * WALL_TILE_SIZE,
        y: tile.y * WALL_TILE_SIZE - upwardRise,
    };
}

/**
 * Legacy diagonal walls were stored with a half-tile projection rise. When
 * their render height is normalized to a full 45-degree rise, move the canvas
 * down by the added rise so its left edge stays joined to a horizontal wall.
 */
export function migrateLegacyWallPosition(
    position: { x: number; y: number },
    storedHeight: number,
    orientation: WallPlacementOrientation,
    standardWidthInTiles = WALL_DEFAULT_WIDTH_TILES,
    heightInTiles = WALL_DEFAULT_HEIGHT_TILES,
): { x: number; y: number } {
    if (!isDiagonalWallOrientation(orientation)) return position;
    const normalizedHeight = getWallRenderSize(orientation, standardWidthInTiles, heightInTiles).height;
    return {
        x: position.x,
        y: position.y + normalizedHeight - storedHeight,
    };
}

export function createWallFoundationCollisionGrid(widthInTiles: number, heightInTiles: number): number[][] {
    const width = Math.max(1, Math.ceil(widthInTiles));
    const height = Math.max(1, Math.ceil(heightInTiles));
    return Array.from({ length: height }, (_, row) =>
        Array.from({ length: width }, () => (row === height - 1 ? 1 : 0)),
    );
}

export function snapWorldPointToWallTile(x: number, y: number, tileSize = WALL_TILE_SIZE): WallTile {
    return { x: Math.floor(x / tileSize), y: Math.floor(y / tileSize) };
}

export function snapWorldPointToWallPlacement(
    x: number,
    y: number,
    orientation: WallPlacementOrientation,
    tileSize = WALL_TILE_SIZE,
): WallTile {
    if (orientation === "horizontal") {
        return {
            x: Math.floor(x / tileSize),
            y: Math.round(y / tileSize),
        };
    }
    return snapWorldPointToWallTile(x, y, tileSize);
}

export function getWallDragOrientation(start: WallTile, current: WallTile, turned: boolean): WallPlacementOrientation {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    if (turned)
        return dx === 0 ? (dy < 0 ? "diagonal-up" : "diagonal-down") : dx * dy < 0 ? "diagonal-up" : "diagonal-down";
    return Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
}

/**
 * Projects an imprecise pointer drag onto one continuous wall axis. The
 * returned wall pieces always touch, regardless of perpendicular pointer drift.
 */
export function getWallDragTiles(
    start: WallTile,
    current: WallTile,
    orientation: WallPlacementOrientation,
    maxTiles = WALL_MAX_DRAG_TILES,
): WallTile[] {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const cells: WallTile[] = [];
    const append = (length: number, stepX: number, stepY: number) => {
        const cappedLength = Math.min(Math.abs(length), Math.max(1, maxTiles) - 1);
        for (let index = 0; index <= cappedLength; index += 1) {
            cells.push({ x: start.x + stepX * index, y: start.y + stepY * index });
        }
    };

    if (orientation === "horizontal") {
        const stride = getWallPlacementSize(orientation).widthInTiles;
        append(Math.floor(Math.abs(dx) / stride), dx < 0 ? -stride : stride, 0);
    } else if (orientation === "vertical") {
        append(dy, 0, dy < 0 ? -1 : 1);
    } else {
        const length = Math.max(Math.abs(dx), Math.abs(dy));
        const stepX = dx < 0 ? -1 : 1;
        const slope = orientation === "diagonal-up" ? -1 : 1;
        append(length, stepX, stepX * slope);
    }
    return cells;
}

/** A diagonal wall always rises one rendered pixel per horizontal pixel; the legacy depth is intentionally ignored. */
export function getWallProjectionRise(projectedWidth: number, _legacyProjectionDepthTiles?: number): number {
    return Math.max(1, Math.round(projectedWidth));
}
