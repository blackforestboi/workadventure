import { WALL_DEFAULT_HEIGHT_TILES, WALL_DEFAULT_WIDTH_TILES, WALL_TILE_SIZE } from "@workadventure/map-editor";
import { AssetGenerationError } from "./AssetGenerationError";

export const WALL_ASSET_WIDTH = WALL_DEFAULT_WIDTH_TILES * WALL_TILE_SIZE;
export const WALL_ASSET_HEIGHT = WALL_DEFAULT_HEIGHT_TILES * WALL_TILE_SIZE;

const MAX_DIMENSION = 4096;
const WALL_ASPECT_RATIO = WALL_ASSET_WIDTH / WALL_ASSET_HEIGHT;

export interface WallAssetCrop {
    sourceX: number;
    sourceY: number;
    sourceWidth: number;
    sourceHeight: number;
}

export function wallAssetCrop(width: number, height: number): WallAssetCrop {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new AssetGenerationError("invalid_request", "The wall image has invalid dimensions.");
    }
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        throw new AssetGenerationError(
            "invalid_request",
            `Wall images cannot exceed ${MAX_DIMENSION}×${MAX_DIMENSION}px.`,
        );
    }

    if (width / height > WALL_ASPECT_RATIO) {
        const sourceWidth = height * WALL_ASPECT_RATIO;
        return {
            sourceX: (width - sourceWidth) / 2,
            sourceY: 0,
            sourceWidth,
            sourceHeight: height,
        };
    }

    const sourceHeight = width / WALL_ASPECT_RATIO;
    return {
        sourceX: 0,
        sourceY: (height - sourceHeight) / 2,
        sourceWidth: width,
        sourceHeight,
    };
}

export function wallAssetFileName(name: string): string {
    const baseName = name.trim().replace(/\.[A-Za-z0-9]+$/, "") || "wall";
    return `${baseName}.png`;
}

/** Re-encodes an image as one centered 2×2 tile (64×64px) wall segment. */
export async function normalizeWallAssetRaster(blob: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    try {
        const crop = wallAssetCrop(bitmap.width, bitmap.height);
        const canvas = document.createElement("canvas");
        canvas.width = WALL_ASSET_WIDTH;
        canvas.height = WALL_ASSET_HEIGHT;
        const context = canvas.getContext("2d");
        if (context === null) throw new AssetGenerationError("invalid_request", "The wall image cannot be decoded.");

        context.clearRect(0, 0, WALL_ASSET_WIDTH, WALL_ASSET_HEIGHT);
        context.imageSmoothingEnabled = false;
        context.drawImage(
            bitmap,
            crop.sourceX,
            crop.sourceY,
            crop.sourceWidth,
            crop.sourceHeight,
            0,
            0,
            WALL_ASSET_WIDTH,
            WALL_ASSET_HEIGHT,
        );

        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((normalized) => {
                if (normalized === null) {
                    reject(new AssetGenerationError("invalid_request", "The wall image cannot be normalized."));
                } else {
                    resolve(normalized);
                }
            }, "image/png");
        });
    } finally {
        bitmap.close();
    }
}
