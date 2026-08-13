import type * as Phaser from "phaser";

const BACKGROUND_COLOR_TOLERANCE = 12;
const TILE_SIZE = 32;

/** Removes only a near-uniform background connected to the raster edge. */
export function removeEdgeConnectedBackground(
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

export function cleanTilesetCanvas(context: CanvasRenderingContext2D, width: number, height: number): boolean {
    let changed = false;
    for (let y = 0; y < height; y += TILE_SIZE) {
        for (let x = 0; x < width; x += TILE_SIZE) {
            const tileWidth = Math.min(TILE_SIZE, width - x);
            const tileHeight = Math.min(TILE_SIZE, height - y);
            const image = context.getImageData(x, y, tileWidth, tileHeight);
            const cleaned = removeEdgeConnectedBackground(image.data, tileWidth, tileHeight);
            if (!cleaned.some((value, index) => value !== image.data[index])) continue;
            image.data.set(cleaned);
            context.putImageData(image, x, y);
            changed = true;
        }
    }
    return changed;
}

/** Replaces an already-loaded custom tileset texture so historic opaque assets render transparently. */
export function cleanLoadedTilesetTexture(textures: Phaser.Textures.TextureManager, textureKey: string): boolean {
    if (!textures.exists(textureKey)) return false;
    const source = textures.get(textureKey).getSourceImage() as CanvasImageSource & {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
    };
    const width = source.naturalWidth ?? source.width ?? 0;
    const height = source.naturalHeight ?? source.height ?? 0;
    if (width <= 0 || height <= 0) return false;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return false;
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, width, height);
    if (!cleanTilesetCanvas(context, width, height)) return false;
    textures.remove(textureKey);
    textures.addCanvas(textureKey, canvas);
    return true;
}

export function cleanLoadedTilesetSpriteSheet(
    textures: Phaser.Textures.TextureManager,
    textureKey: string,
    frameWidth = TILE_SIZE,
    frameHeight = TILE_SIZE,
): boolean {
    if (!textures.exists(textureKey)) return false;
    const source = textures.get(textureKey).getSourceImage() as CanvasImageSource & {
        width?: number;
        height?: number;
        naturalWidth?: number;
        naturalHeight?: number;
    };
    const width = source.naturalWidth ?? source.width ?? 0;
    const height = source.naturalHeight ?? source.height ?? 0;
    if (width <= 0 || height <= 0) return false;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return false;
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, width, height);
    if (!cleanTilesetCanvas(context, width, height)) return false;
    textures.remove(textureKey);
    textures.addSpriteSheet(textureKey, canvas, { frameWidth, frameHeight });
    return true;
}
