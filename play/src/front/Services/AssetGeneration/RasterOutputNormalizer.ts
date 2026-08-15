import { AssetGenerationError } from "./AssetGenerationError";
import { removeEdgeConnectedBackground } from "./ChromaKeyBackgroundRemover";

export interface RasterOutputSize {
    width: number;
    height: number;
    pixelated?: boolean;
}

export interface RasterNormalizationOptions {
    /**
     * If a provider ignored the transparent-background request, remove only the
     * near-uniform color connected to the canvas edge. Interior pixels are kept.
     */
    removeOpaqueEdgeBackground?: boolean;
    /** Fit the entire source inside the output canvas instead of stretching it to fill. */
    resizeMode?: "stretch" | "contain";
}

export interface RasterDrawRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export function fitRasterWithinBounds(
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
): RasterDrawRect {
    const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    return {
        x: (targetWidth - width) / 2,
        y: (targetHeight - height) / 2,
        width,
        height,
    };
}

export async function normalizeGeneratedRaster(
    blob: Blob,
    outputSize?: RasterOutputSize,
    options: RasterNormalizationOptions = {},
): Promise<Blob> {
    if (outputSize === undefined && blob.type === "image/png" && options.removeOpaqueEdgeBackground !== true) {
        return blob;
    }
    const bitmap = await createImageBitmap(blob);
    try {
        const width = outputSize?.width ?? bitmap.width;
        const height = outputSize?.height ?? bitmap.height;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (context === null)
            throw new AssetGenerationError("invalid_request", "The generated image cannot be decoded.");
        context.clearRect(0, 0, width, height);
        context.imageSmoothingEnabled = outputSize?.pixelated !== true;
        const drawRect =
            options.resizeMode === "contain"
                ? fitRasterWithinBounds(bitmap.width, bitmap.height, width, height)
                : { x: 0, y: 0, width, height };
        context.drawImage(bitmap, drawRect.x, drawRect.y, drawRect.width, drawRect.height);
        if (options.removeOpaqueEdgeBackground === true) {
            const image = context.getImageData(0, 0, width, height);
            if (removeEdgeConnectedBackground(image)) context.putImageData(image, 0, 0);
        }
        return await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((normalized) => {
                if (normalized === null) {
                    reject(new AssetGenerationError("invalid_request", "The generated image cannot be normalized."));
                    return;
                }
                resolve(normalized);
            }, "image/png");
        });
    } finally {
        bitmap.close();
    }
}
