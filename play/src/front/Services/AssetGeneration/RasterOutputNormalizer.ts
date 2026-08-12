import { MAP_TILE_SIZE } from "../../Utils/EntityPrefabSize";
import { getDefaultGeneratedMapObjectGridSize } from "../../Utils/GeneratedMapObjectGrid";
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
    /** Alpha-trim a static map object and fit it into a 1×2, 2×1, or 2×2 square-cell canvas. */
    fitMapObjectToGrid?: boolean;
}

export interface OpaqueRasterBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface GridFittedRasterLayout {
    columns: 1 | 2;
    rows: 1 | 2;
    canvasWidth: number;
    canvasHeight: number;
    destinationX: number;
    destinationY: number;
    destinationWidth: number;
    destinationHeight: number;
}

export async function normalizeGeneratedRaster(
    blob: Blob,
    outputSize?: RasterOutputSize,
    options: RasterNormalizationOptions = {},
): Promise<Blob> {
    if (
        outputSize === undefined &&
        blob.type === "image/png" &&
        options.removeOpaqueEdgeBackground !== true &&
        options.fitMapObjectToGrid !== true
    ) {
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
        let image: ImageData | undefined;
        if (options.removeOpaqueEdgeBackground === true || options.fitMapObjectToGrid === true) {
            image = context.getImageData(0, 0, width, height);
        }
        if (options.removeOpaqueEdgeBackground === true && image !== undefined) {
            if (removeEdgeConnectedBackground(image)) context.putImageData(image, 0, 0);
        }
        let outputCanvas = canvas;
        if (options.fitMapObjectToGrid === true && image !== undefined) {
            const bounds = getOpaqueRasterBounds(image.data, width, height);
            if (bounds !== undefined) {
                const layout = getGridFittedRasterLayout(bounds);
                outputCanvas = document.createElement("canvas");
                outputCanvas.width = layout.canvasWidth;
                outputCanvas.height = layout.canvasHeight;
                const outputContext = outputCanvas.getContext("2d");
                if (outputContext === null) {
                    throw new AssetGenerationError("invalid_request", "The generated image cannot be normalized.");
                }
                outputContext.imageSmoothingEnabled = outputSize?.pixelated !== true;
                outputContext.drawImage(
                    canvas,
                    bounds.left,
                    bounds.top,
                    bounds.width,
                    bounds.height,
                    layout.destinationX,
                    layout.destinationY,
                    layout.destinationWidth,
                    layout.destinationHeight,
                );
            }
        }
        return await new Promise<Blob>((resolve, reject) => {
            outputCanvas.toBlob((normalized) => {
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

export function getOpaqueRasterBounds(
    data: Uint8ClampedArray,
    width: number,
    height: number,
): OpaqueRasterBounds | undefined {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] === 0) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }

    return right < left || bottom < top ? undefined : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export function getGridFittedRasterLayout(bounds: OpaqueRasterBounds): GridFittedRasterLayout {
    const grid = getDefaultGeneratedMapObjectGridSize(bounds.width, bounds.height);
    const canvasWidth = grid.width * MAP_TILE_SIZE;
    const canvasHeight = grid.height * MAP_TILE_SIZE;
    const scale = Math.min(canvasWidth / bounds.width, canvasHeight / bounds.height);
    const destinationWidth = Math.max(1, Math.round(bounds.width * scale));
    const destinationHeight = Math.max(1, Math.round(bounds.height * scale));

    return {
        columns: grid.width,
        rows: grid.height,
        canvasWidth,
        canvasHeight,
        destinationX: Math.floor((canvasWidth - destinationWidth) / 2),
        destinationY: Math.floor((canvasHeight - destinationHeight) / 2),
        destinationWidth,
        destinationHeight,
    };
}
