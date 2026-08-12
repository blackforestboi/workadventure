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
        context.drawImage(bitmap, 0, 0, width, height);
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
