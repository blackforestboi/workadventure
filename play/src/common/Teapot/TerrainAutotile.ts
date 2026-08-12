import { compactTeapotTileRegions, type TeapotTileRegion } from "@workadventure/map-editor";

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
    innerTopLeft: number;
    innerTopRight: number;
    innerBottomLeft: number;
    innerBottomRight: number;
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

export interface TerrainTile extends TerrainTileCoordinate {
    gid: number;
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

function coordinateKey({ x, y }: TerrainTileCoordinate): string {
    return `${x},${y}`;
}

function tileForContour(
    coordinate: TerrainTileCoordinate,
    occupied: ReadonlySet<string>,
    tiles: TerrainAutotileTiles,
): number {
    const contains = (x: number, y: number) => occupied.has(coordinateKey({ x, y }));
    const north = contains(coordinate.x, coordinate.y - 1);
    const east = contains(coordinate.x + 1, coordinate.y);
    const south = contains(coordinate.x, coordinate.y + 1);
    const west = contains(coordinate.x - 1, coordinate.y);

    if (!west && !east) {
        if (!north && !south) return tiles.center;
        if (!north) return tiles.top;
        if (!south) return tiles.bottom;
    }
    if (!north && !south) {
        if (!west) return tiles.left;
        if (!east) return tiles.right;
    }

    if (!north && !west) return tiles.topLeft;
    if (!north && !east) return tiles.topRight;
    if (!south && !west) return tiles.bottomLeft;
    if (!south && !east) return tiles.bottomRight;
    if (!north) return tiles.top;
    if (!east) return tiles.right;
    if (!south) return tiles.bottom;
    if (!west) return tiles.left;

    const missingDiagonals = [
        !contains(coordinate.x - 1, coordinate.y - 1) ? tiles.innerTopLeft : undefined,
        !contains(coordinate.x + 1, coordinate.y - 1) ? tiles.innerTopRight : undefined,
        !contains(coordinate.x - 1, coordinate.y + 1) ? tiles.innerBottomLeft : undefined,
        !contains(coordinate.x + 1, coordinate.y + 1) ? tiles.innerBottomRight : undefined,
    ].filter((tile): tile is number => tile !== undefined);
    return missingDiagonals.length === 1 ? missingDiagonals[0] : tiles.center;
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

/**
 * Adds a dragged rectangle to same-family occupancy and retiles only the new
 * footprint plus its contour halo. Distant cells are never re-emitted.
 */
export function createMergedTerrainAutotileRegions(
    layer: string,
    start: TerrainTileCoordinate,
    end: TerrainTileCoordinate,
    tiles: TerrainAutotileTiles,
    existingTiles: Iterable<TerrainTile>,
    matchingFamilyGids: ReadonlySet<number> = new Set(Object.values(tiles)),
): TeapotTileRegion[] {
    const bounds = normalizeTerrainRectangle(start, end);
    const existing = new Map<string, TerrainTile>();
    const occupied = new Map<string, TerrainTileCoordinate>();
    for (const tile of existingTiles) {
        existing.set(coordinateKey(tile), tile);
        if (matchingFamilyGids.has(tile.gid)) occupied.set(coordinateKey(tile), tile);
    }

    const painted = new Map<string, TerrainTileCoordinate>();
    for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
        for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
            const coordinate = { x, y };
            const key = coordinateKey(coordinate);
            occupied.set(key, coordinate);
            painted.set(key, coordinate);
        }
    }
    return retilePaintedTerrain(layer, occupied, painted, existing, tiles);
}

function lineCoordinates(start: TerrainTileCoordinate, end: TerrainTileCoordinate): TerrainTileCoordinate[] {
    const coordinates: TerrainTileCoordinate[] = [];
    let x = start.x;
    let y = start.y;
    const deltaX = Math.abs(end.x - start.x);
    const deltaY = Math.abs(end.y - start.y);
    const stepX = start.x < end.x ? 1 : -1;
    const stepY = start.y < end.y ? 1 : -1;
    let error = deltaX - deltaY;
    while (true) {
        coordinates.push({ x, y });
        if (x === end.x && y === end.y) return coordinates;
        const doubledError = error * 2;
        if (doubledError > -deltaY) {
            error -= deltaY;
            x += stepX;
        }
        if (doubledError < deltaX) {
            error += deltaX;
            y += stepY;
        }
    }
}

/**
 * Paints a three-tile-wide stroke into the matching terrain occupancy mask,
 * then retiles only that footprint and its contour halo. Existing fields touched
 * by the stroke become one surface without revisiting the rest of either field.
 */
export function createLiquidTerrainBrushRegions(
    layer: string,
    _seed: TerrainTileCoordinate,
    previous: TerrainTileCoordinate,
    target: TerrainTileCoordinate,
    tiles: TerrainAutotileTiles,
    existingTiles: Iterable<TerrainTile>,
    matchingFamilyGids: ReadonlySet<number> = new Set(Object.values(tiles)),
): TeapotTileRegion[] {
    const existing = new Map<string, TerrainTile>();
    const occupied = new Map<string, TerrainTileCoordinate>();
    for (const tile of existingTiles) {
        existing.set(coordinateKey(tile), tile);
        if (matchingFamilyGids.has(tile.gid)) occupied.set(coordinateKey(tile), tile);
    }

    const stroke = new Map<string, TerrainTileCoordinate>();
    for (const coordinate of lineCoordinates(previous, target)) stroke.set(coordinateKey(coordinate), coordinate);

    const added = new Map<string, TerrainTileCoordinate>();
    for (const coordinate of stroke.values()) {
        for (let y = coordinate.y - 1; y <= coordinate.y + 1; y += 1) {
            for (let x = coordinate.x - 1; x <= coordinate.x + 1; x += 1) {
                const painted = { x, y };
                const key = coordinateKey(painted);
                added.set(key, painted);
                occupied.set(key, painted);
            }
        }
    }
    return retilePaintedTerrain(layer, occupied, added, existing, tiles);
}

function retilePaintedTerrain(
    layer: string,
    occupied: ReadonlyMap<string, TerrainTileCoordinate>,
    painted: ReadonlyMap<string, TerrainTileCoordinate>,
    existing: ReadonlyMap<string, TerrainTile>,
    tiles: TerrainAutotileTiles,
): TeapotTileRegion[] {
    const dirty = new Map<string, TerrainTileCoordinate>();
    for (const coordinate of painted.values()) {
        for (let y = coordinate.y - 1; y <= coordinate.y + 1; y += 1) {
            for (let x = coordinate.x - 1; x <= coordinate.x + 1; x += 1) {
                const neighbour = { x, y };
                dirty.set(coordinateKey(neighbour), neighbour);
            }
        }
    }

    const occupiedKeys = new Set(occupied.keys());
    const changed: TeapotTileRegion[] = [];
    for (const [key, coordinate] of dirty) {
        if (!occupied.has(key)) continue;
        const gid = tileForContour(coordinate, occupiedKeys, tiles);
        if (existing.get(key)?.gid === gid) continue;
        changed.push({ layer, ...coordinate, width: 1, height: 1, gids: [gid] });
    }
    return compactTeapotTileRegions(changed);
}

export function createTerrainTileRegion(
    layer: string,
    start: TerrainTileCoordinate,
    end: TerrainTileCoordinate,
    gid: number,
): TeapotTileRegion {
    const bounds = normalizeTerrainRectangle(start, end);
    return { layer, ...bounds, gids: Array.from({ length: bounds.width * bounds.height }, () => gid) };
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
        innerTopLeft: firstGid + tiles.innerTopLeft,
        innerTopRight: firstGid + tiles.innerTopRight,
        innerBottomLeft: firstGid + tiles.innerBottomLeft,
        innerBottomRight: firstGid + tiles.innerBottomRight,
    };
}
