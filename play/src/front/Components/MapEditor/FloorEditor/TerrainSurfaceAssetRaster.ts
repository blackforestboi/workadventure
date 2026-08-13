import type { AssetGenerationReference } from "../../../Services/AssetGeneration/AssetGenerationTypes";
import {
    createInitialTerrainSurfaceCrop,
    measureOpaquePixelBounds,
    TERRAIN_SURFACE_GRID_SIZE,
    type TerrainSurfaceCrop,
} from "./TerrainSurfaceAssetLayout";

const GUIDE_SIZE = 1024;
const BACKGROUND_COLOR_TOLERANCE = 28;

export interface PreparedTerrainSurfaceSource {
    blob: Blob;
    width: number;
    height: number;
    crop: TerrainSurfaceCrop;
}

export async function prepareTerrainSurfaceSource(blob: Blob): Promise<PreparedTerrainSurfaceSource> {
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context === null) throw new Error("The surface image could not be inspected.");
        context.drawImage(bitmap, 0, 0);
        const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
        image.data.set(removeEdgeConnectedTerrainBackground(image.data, bitmap.width, bitmap.height));
        context.putImageData(image, 0, 0);
        const opaqueBounds = measureOpaquePixelBounds(image.data, bitmap.width, bitmap.height);
        return {
            blob: await canvasToPng(canvas),
            width: bitmap.width,
            height: bitmap.height,
            crop: createInitialTerrainSurfaceCrop(bitmap.width, bitmap.height, opaqueBounds),
        };
    } finally {
        bitmap.close();
    }
}

/** Crops the approved logical grid without changing its native pixel density. */
export async function cropTerrainSurfaceSource(blob: Blob, crop: TerrainSurfaceCrop): Promise<Blob> {
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = crop.size;
        canvas.height = crop.size;
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("The approved surface could not be exported.");
        context.clearRect(0, 0, crop.size, crop.size);
        context.imageSmoothingEnabled = false;
        context.drawImage(bitmap, crop.x, crop.y, crop.size, crop.size, 0, 0, crop.size, crop.size);
        const image = context.getImageData(0, 0, crop.size, crop.size);
        image.data.set(removeEdgeConnectedTerrainBackground(image.data, crop.size, crop.size));
        context.putImageData(image, 0, 0);
        return await canvasToPng(canvas);
    } finally {
        bitmap.close();
    }
}

/** Removes only a near-uniform background connected to the canvas edge. */
export function removeEdgeConnectedTerrainBackground(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
): Uint8ClampedArray {
    const output = new Uint8ClampedArray(pixels);
    if (width <= 0 || height <= 0 || pixels.length !== width * height * 4) return output;

    const samples: Array<[number, number, number]> = [];
    const addSample = (x: number, y: number) => {
        const offset = (y * width + x) * 4;
        if (pixels[offset + 3] > 0) samples.push([pixels[offset], pixels[offset + 1], pixels[offset + 2]]);
    };
    for (let x = 0; x < width; x += 1) {
        addSample(x, 0);
        if (height > 1) addSample(x, height - 1);
    }
    for (let y = 1; y < height - 1; y += 1) {
        addSample(0, y);
        if (width > 1) addSample(width - 1, y);
    }
    if (samples.length === 0) return output;

    const median = (channel: number) => {
        const values = samples.map((sample) => sample[channel]).sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)];
    };
    const background = [median(0), median(1), median(2)];
    const colorDistance = (offset: number) =>
        Math.max(
            Math.abs(pixels[offset] - background[0]),
            Math.abs(pixels[offset + 1] - background[1]),
            Math.abs(pixels[offset + 2] - background[2]),
        );
    const matchingEdgeSamples = samples.filter(
        (sample) =>
            Math.max(
                Math.abs(sample[0] - background[0]),
                Math.abs(sample[1] - background[1]),
                Math.abs(sample[2] - background[2]),
            ) <= BACKGROUND_COLOR_TOLERANCE,
    ).length;
    if (matchingEdgeSamples / samples.length < 0.7) return output;

    let distinctSubjectPixels = 0;
    for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset + 3] > 0 && colorDistance(offset) > BACKGROUND_COLOR_TOLERANCE) distinctSubjectPixels += 1;
    }
    if (distinctSubjectPixels < Math.max(4, width * height * 0.02)) return output;

    const matchesBackground = (pixel: number) =>
        pixels[pixel * 4 + 3] > 0 && colorDistance(pixel * 4) <= BACKGROUND_COLOR_TOLERANCE;

    const visited = new Uint8Array(width * height);
    const queue: number[] = [];
    const enqueue = (pixel: number) => {
        if (visited[pixel] !== 0 || !matchesBackground(pixel)) return;
        visited[pixel] = 1;
        queue.push(pixel);
    };
    for (let x = 0; x < width; x += 1) {
        enqueue(x);
        enqueue((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
        enqueue(y * width);
        enqueue(y * width + width - 1);
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const pixel = queue[cursor];
        output[pixel * 4 + 3] = 0;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        if (x > 0) enqueue(pixel - 1);
        if (x + 1 < width) enqueue(pixel + 1);
        if (y > 0) enqueue(pixel - width);
        if (y + 1 < height) enqueue(pixel + width);
    }
    return output;
}

/**
 * A geometry-only reference for the model. It intentionally contains no style,
 * texture, lighting, or pixel-art cues.
 */
export async function createTerrainSurfaceGuideReference(): Promise<AssetGenerationReference> {
    const canvas = document.createElement("canvas");
    canvas.width = GUIDE_SIZE;
    canvas.height = GUIDE_SIZE;
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("The surface guide could not be created.");

    context.fillStyle = "#17243a";
    context.fillRect(0, 0, GUIDE_SIZE, GUIDE_SIZE);
    context.fillStyle = "#ffffff";
    context.beginPath();
    // A rounded four-arm cross on a 5×5 logical grid. Its four inward notches
    // and eight outward tip corners provide both boundary directions from one
    // continuous line, while the centre plus contains five full material cells.
    context.moveTo(448, 112);
    context.lineTo(576, 112);
    context.quadraticCurveTo(592, 112, 592, 128);
    context.lineTo(592, 416);
    context.quadraticCurveTo(592, 432, 608, 432);
    context.lineTo(896, 432);
    context.quadraticCurveTo(912, 432, 912, 448);
    context.lineTo(912, 576);
    context.quadraticCurveTo(912, 592, 896, 592);
    context.lineTo(608, 592);
    context.quadraticCurveTo(592, 592, 592, 608);
    context.lineTo(592, 896);
    context.quadraticCurveTo(592, 912, 576, 912);
    context.lineTo(448, 912);
    context.quadraticCurveTo(432, 912, 432, 896);
    context.lineTo(432, 608);
    context.quadraticCurveTo(432, 592, 416, 592);
    context.lineTo(128, 592);
    context.quadraticCurveTo(112, 592, 112, 576);
    context.lineTo(112, 448);
    context.quadraticCurveTo(112, 432, 128, 432);
    context.lineTo(416, 432);
    context.quadraticCurveTo(432, 432, 432, 416);
    context.lineTo(432, 128);
    context.quadraticCurveTo(432, 112, 448, 112);
    context.closePath();
    context.fill();

    const blob = await canvasToPng(canvas);
    return { id: "terrain-surface-four-point-guide", blob, mimeType: "image/png" };
}

export const TERRAIN_SURFACE_GENERATION_RULES = [
    "Use the supplied geometry reference only as a silhouette and composition mask.",
    "Create exactly one connected, top-down four-arm cross-shaped terrain specimen on a transparent background; do not turn it into a diamond, circle, or doughnut.",
    `The specimen must align as one square ${TERRAIN_SURFACE_GRID_SIZE} by ${TERRAIN_SURFACE_GRID_SIZE} logical tile grid.`,
    "Keep five visibly distinct but compatible uninterrupted material areas around the centre for reusable full-tile variations.",
    "Preserve the cross's inward notches and outward tip corners, with every cardinal direction having at least one long, nearly straight boundary segment.",
    "Let the twelve straight boundary runs vary organically in detail while keeping one continuous outline, material, scale, palette, and lighting.",
    "Include no grid lines, labels, gutters, detached samples, vegetation, props, scenery, perspective, or text.",
    "This workflow is for solid terrain surfaces, not water or other liquids.",
    "Do not imitate the guide's white and navy colours; render only the material requested by the user.",
].join(" ");

function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
            if (blob === null) reject(new Error("The surface image could not be encoded."));
            else resolve(blob);
        }, "image/png");
    });
}
