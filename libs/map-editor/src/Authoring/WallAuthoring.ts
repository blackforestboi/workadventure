import type { WallPlacementOrientation } from "../types";

export const WALL_TILE_SIZE = 32;
export const WALL_MAX_DRAG_TILES = 256;
export const WALL_DEFAULT_WIDTH_TILES = 2;
export const WALL_DEFAULT_HEIGHT_TILES = 2;
export const WALL_DIAGONAL_WIDTH_TILES = 1;
export const WALL_VERTICAL_WIDTH_TILES = 0;
export const WALL_EDGE_RENDER_WIDTH = 1;

export type WallTile = { x: number; y: number };

export function isDiagonalWallOrientation(orientation: WallPlacementOrientation): boolean {
    return orientation === "diagonal-up" || orientation === "diagonal-down";
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

export function getWallDragOrientation(start: WallTile, current: WallTile, turned: boolean): WallPlacementOrientation {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    if (turned)
        return dx === 0 ? (dy < 0 ? "diagonal-up" : "diagonal-down") : dx * dy < 0 ? "diagonal-up" : "diagonal-down";
    return Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
}

/**
 * Projects an imprecise pointer drag onto one continuous wall axis. The
 * returned cells always touch, regardless of perpendicular pointer drift.
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
        append(dx, dx < 0 ? -1 : 1, 0);
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

export function getWallProjectionRise(sourceWidth: number, projectionDepthTiles: number): number {
    return Math.max(1, Math.round(sourceWidth * projectionDepthTiles));
}
