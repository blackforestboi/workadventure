export const MAP_TILE_SIZE = 32;
export const DEFAULT_TREE_HEIGHT_IN_TILES = 2;
export const ENTITY_SIZE_TILE_OPTIONS = [0.5, 1, 2, 3, 4, 8, 16, 32, 50, 75, 100] as const;

const SMALL_TREE_MAX_VISIBLE_SIZE = 48;
const MEDIUM_TREE_MAX_VISIBLE_SIZE = 64;
const SMALL_TREE_TARGET_SIZE = MAP_TILE_SIZE;
const MEDIUM_TREE_TARGET_SIZE = MAP_TILE_SIZE * 1.5;
const LARGE_TREE_TARGET_SIZE = MAP_TILE_SIZE * 2;

export type VisibleBounds = { width: number; height: number };

export function getOpaqueBoundsFromAlphaBuffer(
    pixels: ArrayLike<number>,
    width: number,
    height: number,
): VisibleBounds | undefined {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
        return undefined;
    }

    const requiredLength = width * height * 4;
    if (pixels.length < requiredLength) {
        return undefined;
    }

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const alpha = pixels[(y * width + x) * 4 + 3];
            if (alpha === undefined || alpha <= 0) {
                continue;
            }
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    if (maxX < minX || maxY < minY) {
        return undefined;
    }

    return { width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function getEntityDisplaySize(
    naturalWidth: number,
    naturalHeight: number,
    defaultSizeInTiles: number | undefined,
    defaultHeightInTiles?: number,
): { width: number; height: number } {
    if (defaultSizeInTiles === undefined || naturalWidth <= 0 || naturalHeight <= 0) {
        return { width: naturalWidth, height: naturalHeight };
    }

    // A stored height means these values describe the independent collision grid.
    // Keep the raster at its natural placed size instead of stretching it to that grid.
    if (defaultHeightInTiles !== undefined) {
        return { width: naturalWidth, height: naturalHeight };
    }

    const width = defaultSizeInTiles * MAP_TILE_SIZE;
    return {
        width,
        height: width * (naturalHeight / naturalWidth),
    };
}

export function getVegetationDisplaySize(
    naturalWidth: number,
    naturalHeight: number,
    category: "tree" | "bush" | "grass" | "other" | undefined,
    visibleWidth?: number,
    visibleHeight?: number,
): { width: number; height: number } | undefined {
    if (
        category !== "tree" ||
        !Number.isFinite(naturalWidth) ||
        !Number.isFinite(naturalHeight) ||
        naturalWidth <= 0 ||
        naturalHeight <= 0
    ) {
        return undefined;
    }

    if (
        visibleWidth !== undefined &&
        visibleHeight !== undefined &&
        Number.isFinite(visibleWidth) &&
        Number.isFinite(visibleHeight) &&
        visibleWidth > 0 &&
        visibleHeight > 0
    ) {
        const longestVisibleDimension = Math.max(visibleWidth, visibleHeight);
        const targetVisibleSize =
            longestVisibleDimension <= SMALL_TREE_MAX_VISIBLE_SIZE
                ? SMALL_TREE_TARGET_SIZE
                : longestVisibleDimension <= MEDIUM_TREE_MAX_VISIBLE_SIZE
                  ? MEDIUM_TREE_TARGET_SIZE
                  : LARGE_TREE_TARGET_SIZE;
        const scale = targetVisibleSize / longestVisibleDimension;

        return { width: naturalWidth * scale, height: naturalHeight * scale };
    }

    // Pixel inspection is best-effort. Keep the established two-tile-height sizing
    // when visible bounds are unavailable so a tree can always still be placed.
    const height = DEFAULT_TREE_HEIGHT_IN_TILES * MAP_TILE_SIZE;
    return { width: height * (naturalWidth / naturalHeight), height };
}

export function shouldPlaceEntity(
    canPlace: boolean,
    vegetationCategory: "tree" | "bush" | "grass" | "other" | undefined,
): boolean {
    return canPlace || vegetationCategory === "tree";
}
