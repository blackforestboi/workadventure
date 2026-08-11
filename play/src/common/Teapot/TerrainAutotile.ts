import type { TeapotTileRegion } from "@workadventure/map-editor";

export interface TerrainAutotileTiles {
    topLeft: number;
    top: number;
    topRight: number;
    left: number;
    center: number;
    right: number;
    bottomLeft: number;
    bottom: number;
    bottomRight: number;
}

export interface TerrainTileCoordinate {
    x: number;
    y: number;
}

export interface TerrainRectangleBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function normalizeTerrainRectangle(
    start: TerrainTileCoordinate,
    end: TerrainTileCoordinate,
): TerrainRectangleBounds {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    return {
        x,
        y,
        width: Math.max(start.x, end.x) - x + 1,
        height: Math.max(start.y, end.y) - y + 1,
    };
}

function tileForPosition(x: number, y: number, width: number, height: number, tiles: TerrainAutotileTiles): number {
    if (width === 1 && height === 1) return tiles.center;

    const horizontal = width === 1 ? "center" : x === 0 ? "left" : x === width - 1 ? "right" : "center";
    const vertical = height === 1 ? "center" : y === 0 ? "top" : y === height - 1 ? "bottom" : "center";

    if (vertical === "top") {
        if (horizontal === "left") return tiles.topLeft;
        if (horizontal === "right") return tiles.topRight;
        return tiles.top;
    }
    if (vertical === "bottom") {
        if (horizontal === "left") return tiles.bottomLeft;
        if (horizontal === "right") return tiles.bottomRight;
        return tiles.bottom;
    }
    if (horizontal === "left") return tiles.left;
    if (horizontal === "right") return tiles.right;
    return tiles.center;
}

export function createTerrainAutotileRegion(
    layer: string,
    start: TerrainTileCoordinate,
    end: TerrainTileCoordinate,
    tiles: TerrainAutotileTiles,
): TeapotTileRegion {
    const bounds = normalizeTerrainRectangle(start, end);
    const gids = Array.from({ length: bounds.width * bounds.height }, (_, index) => {
        const x = index % bounds.width;
        const y = Math.floor(index / bounds.width);
        return tileForPosition(x, y, bounds.width, bounds.height, tiles);
    });
    return { layer, ...bounds, gids };
}

export function translateTerrainAutotileTiles(tiles: TerrainAutotileTiles, firstGid: number): TerrainAutotileTiles {
    return {
        topLeft: firstGid + tiles.topLeft,
        top: firstGid + tiles.top,
        topRight: firstGid + tiles.topRight,
        left: firstGid + tiles.left,
        center: firstGid + tiles.center,
        right: firstGid + tiles.right,
        bottomLeft: firstGid + tiles.bottomLeft,
        bottom: firstGid + tiles.bottom,
        bottomRight: firstGid + tiles.bottomRight,
    };
}
