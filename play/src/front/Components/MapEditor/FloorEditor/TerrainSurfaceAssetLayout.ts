export const TERRAIN_SURFACE_GRID_SIZE = 5;

export interface TerrainSurfaceCrop {
    x: number;
    y: number;
    size: number;
}

export interface OpaquePixelBounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

export interface TerrainSurfaceCell {
    column: number;
    row: number;
}

/** The five cells kept wholly inside the canonical four-point specimen. */
export const TERRAIN_SURFACE_VARIATION_CELLS: readonly TerrainSurfaceCell[] = [
    { column: 2, row: 1 },
    { column: 1, row: 2 },
    { column: 2, row: 2 },
    { column: 3, row: 2 },
    { column: 2, row: 3 },
];

/** Representative cells used to assemble the gapless external-boundary review. */
export const TERRAIN_SURFACE_EXTERNAL_PREVIEW_CELLS: readonly TerrainSurfaceCell[] = [
    { column: 1, row: 1 },
    { column: 2, row: 0 },
    { column: 3, row: 1 },
    { column: 0, row: 2 },
    { column: 2, row: 2 },
    { column: 4, row: 2 },
    { column: 1, row: 3 },
    { column: 2, row: 4 },
    { column: 3, row: 3 },
];

export function measureOpaquePixelBounds(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    alphaThreshold = 8,
): OpaquePixelBounds | undefined {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    for (let row = 0; row < height; row += 1) {
        for (let column = 0; column < width; column += 1) {
            if (pixels[(row * width + column) * 4 + 3] <= alphaThreshold) continue;
            left = Math.min(left, column);
            top = Math.min(top, row);
            right = Math.max(right, column);
            bottom = Math.max(bottom, row);
        }
    }
    return right < left || bottom < top ? undefined : { left, top, right, bottom };
}

export function createInitialTerrainSurfaceCrop(
    imageWidth: number,
    imageHeight: number,
    opaqueBounds?: OpaquePixelBounds,
): TerrainSurfaceCrop {
    const maximumSize = floorToGrid(Math.min(imageWidth, imageHeight));
    if (maximumSize < TERRAIN_SURFACE_GRID_SIZE) return { x: 0, y: 0, size: TERRAIN_SURFACE_GRID_SIZE };

    if (opaqueBounds === undefined) {
        return {
            x: Math.round((imageWidth - maximumSize) / 2),
            y: Math.round((imageHeight - maximumSize) / 2),
            size: maximumSize,
        };
    }

    const contentWidth = opaqueBounds.right - opaqueBounds.left + 1;
    const contentHeight = opaqueBounds.bottom - opaqueBounds.top + 1;
    const paddedSize = ceilToGrid(Math.max(contentWidth, contentHeight) * 1.08);
    const size = Math.min(maximumSize, Math.max(TERRAIN_SURFACE_GRID_SIZE, paddedSize));
    const centerX = (opaqueBounds.left + opaqueBounds.right + 1) / 2;
    const centerY = (opaqueBounds.top + opaqueBounds.bottom + 1) / 2;
    return clampTerrainSurfaceCrop(
        { x: Math.round(centerX - size / 2), y: Math.round(centerY - size / 2), size },
        imageWidth,
        imageHeight,
    );
}

export function clampTerrainSurfaceCrop(
    crop: TerrainSurfaceCrop,
    imageWidth: number,
    imageHeight: number,
): TerrainSurfaceCrop {
    const maximumSize = Math.max(TERRAIN_SURFACE_GRID_SIZE, floorToGrid(Math.min(imageWidth, imageHeight)));
    const size = Math.min(maximumSize, Math.max(TERRAIN_SURFACE_GRID_SIZE, roundToGrid(crop.size)));
    return {
        x: Math.max(0, Math.min(Math.round(crop.x), imageWidth - size)),
        y: Math.max(0, Math.min(Math.round(crop.y), imageHeight - size)),
        size,
    };
}

export function terrainSurfaceTilePixelSize(crop: TerrainSurfaceCrop): number {
    return crop.size / TERRAIN_SURFACE_GRID_SIZE;
}

export function terrainSurfaceCellSourceRect(crop: TerrainSurfaceCrop, cell: TerrainSurfaceCell) {
    const tileSize = terrainSurfaceTilePixelSize(crop);
    return {
        x: crop.x + cell.column * tileSize,
        y: crop.y + cell.row * tileSize,
        size: tileSize,
    };
}

function floorToGrid(value: number): number {
    return Math.floor(value / TERRAIN_SURFACE_GRID_SIZE) * TERRAIN_SURFACE_GRID_SIZE;
}

function ceilToGrid(value: number): number {
    return Math.ceil(value / TERRAIN_SURFACE_GRID_SIZE) * TERRAIN_SURFACE_GRID_SIZE;
}

function roundToGrid(value: number): number {
    return Math.round(value / TERRAIN_SURFACE_GRID_SIZE) * TERRAIN_SURFACE_GRID_SIZE;
}
