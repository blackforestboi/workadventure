import { AssetGenerationError } from "./AssetGenerationError";

const TILE_SIZE = 32;
const MAX_DIMENSION = 2048;

export interface TerrainTileCrop {
    sourceX: number;
    sourceY: number;
    sourceSize: number;
}

export function terrainTileCrop(width: number, height: number): TerrainTileCrop {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new AssetGenerationError("invalid_request", "The terrain image has invalid dimensions.");
    }
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        throw new AssetGenerationError(
            "invalid_request",
            `Terrain images cannot exceed ${MAX_DIMENSION}×${MAX_DIMENSION}px.`,
        );
    }
    const sourceSize = Math.min(width, height);
    return {
        sourceX: (width - sourceSize) / 2,
        sourceY: (height - sourceSize) / 2,
        sourceSize,
    };
}

/** Re-encodes an import as one centered, self-contained 32px terrain tile. */
export async function normalizeTilesetRaster(blob: Blob): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    try {
        const crop = terrainTileCrop(bitmap.width, bitmap.height);
        const canvas = document.createElement("canvas");
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const context = canvas.getContext("2d");
        if (context === null) throw new AssetGenerationError("invalid_request", "The terrain tile cannot be decoded.");
        context.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
        context.imageSmoothingEnabled = false;
        context.drawImage(
            bitmap,
            crop.sourceX,
            crop.sourceY,
            crop.sourceSize,
            crop.sourceSize,
            0,
            0,
            TILE_SIZE,
            TILE_SIZE,
        );
        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((normalized) => {
                if (normalized === null)
                    reject(new AssetGenerationError("invalid_request", "The terrain tile cannot be normalized."));
                else resolve(normalized);
            }, "image/png");
        });
    } finally {
        bitmap.close();
    }
}
