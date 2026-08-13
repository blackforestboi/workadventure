import type { WallPlacementOrientation } from "../types";

export const WALL_TILE_SIZE = 32;
export const WALL_MAX_DRAG_TILES = 256;

export type WallTile = { x: number; y: number };

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
