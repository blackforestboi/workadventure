const ALPHA_NOISE_FLOOR = 0.02;
const ALPHA_OPAQUE_CEILING = 0.98;

/**
 * Reconstructs an alpha channel from the same subject rendered once on white
 * and once on black. This avoids treating a model-generated checkerboard as
 * transparency and retains soft details such as hair and glass.
 */
export function triangulateAlphaPixels(white: ImageData, black: ImageData): ImageData {
    if (white.width !== black.width || white.height !== black.height) {
        throw new Error("The white and black matte renders have different dimensions.");
    }

    const output = new Uint8ClampedArray(white.data.length);
    for (let offset = 0; offset < output.length; offset += 4) {
        const matteDifference =
            (white.data[offset] -
                black.data[offset] +
                (white.data[offset + 1] - black.data[offset + 1]) +
                (white.data[offset + 2] - black.data[offset + 2])) /
            (3 * 255);
        let alpha = clamp(1 - matteDifference, 0, 1);
        if (alpha <= ALPHA_NOISE_FLOOR) alpha = 0;
        if (alpha >= ALPHA_OPAQUE_CEILING) alpha = 1;

        if (alpha === 0) {
            output[offset + 3] = 0;
            continue;
        }

        // With a black backing, RGB is already premultiplied by alpha.
        output[offset] = clamp(Math.round(black.data[offset] / alpha), 0, 255);
        output[offset + 1] = clamp(Math.round(black.data[offset + 1] / alpha), 0, 255);
        output[offset + 2] = clamp(Math.round(black.data[offset + 2] / alpha), 0, 255);
        output[offset + 3] = Math.round(alpha * 255);
    }
    // `white` comes from canvas.getImageData in production, so mutating its
    // buffer preserves the browser's native ImageData instance for putImageData.
    white.data.set(output);
    return white;
}

export async function triangulateAlphaMatte(white: Blob, black: Blob): Promise<Blob> {
    if (typeof createImageBitmap !== "function" || typeof OffscreenCanvas !== "function") {
        throw new Error("This browser cannot process generated transparency.");
    }
    const [whiteBitmap, blackBitmap] = await Promise.all([createImageBitmap(white), createImageBitmap(black)]);
    try {
        if (whiteBitmap.width !== blackBitmap.width || whiteBitmap.height !== blackBitmap.height) {
            throw new Error("The white and black matte renders have different dimensions.");
        }
        const canvas = new OffscreenCanvas(whiteBitmap.width, whiteBitmap.height);
        const context = canvas.getContext("2d");
        if (context === null) throw new Error("This browser cannot process generated transparency.");
        context.drawImage(whiteBitmap, 0, 0);
        const whitePixels = context.getImageData(0, 0, canvas.width, canvas.height);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(blackBitmap, 0, 0);
        const blackPixels = context.getImageData(0, 0, canvas.width, canvas.height);
        context.putImageData(triangulateAlphaPixels(whitePixels, blackPixels), 0, 0);
        return canvas.convertToBlob({ type: "image/webp", quality: 0.92 });
    } finally {
        whiteBitmap.close();
        blackBitmap.close();
    }
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value));
}
