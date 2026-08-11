const TRANSPARENT_ALPHA = 32;
const MINIMUM_TRANSPARENT_BORDER_RATIO = 0.7;
const MINIMUM_DOMINANT_BORDER_RATIO = 0.45;
const MINIMUM_TWO_COLOR_BORDER_RATIO = 0.8;
const MINIMUM_PATTERNED_MATTE_RATIO = 0.8;
const MAXIMUM_PATTERNED_MATTE_COLORS = 3;
const FLOOR_SCAN_START_RATIO = 0.7;
const MINIMUM_FLOOR_LINE_WIDTH_RATIO = 0.4;
const MINIMUM_FLOOR_LINE_DENSITY = 0.55;
const FLOOR_COLOR_DISTANCE = 34;
const MINIMUM_MATCHING_BORDER_RATIO = 0.65;
const SOLID_MATTE_DISTANCE = 28;
const FEATHERED_MATTE_DISTANCE = 88;
// Interior removal is deliberately much stricter than edge-connected removal.
// It clears a true chroma key inside a staff/cape gap without treating shading
// that merely resembles the matte as transparent.
const EXACT_INTERIOR_MATTE_DISTANCE = 4;

interface RgbColor {
    red: number;
    green: number;
    blue: number;
}

/**
 * Removes only a near-uniform matte connected to the outside of an image.
 * Matching colors enclosed by the subject are preserved.
 */
export function removeEdgeConnectedBackground(image: ImageData): boolean {
    const { width, height, data } = image;
    if (width < 1 || height < 1 || data.length !== width * height * 4) return false;

    const border = borderPixelIndexes(width, height);
    const transparentBorderPixels = border.filter((pixel) => data[pixel * 4 + 3] <= TRANSPARENT_ALPHA).length;
    if (transparentBorderPixels / border.length >= MINIMUM_TRANSPARENT_BORDER_RATIO) {
        return removeLowerFloorIllustration(image);
    }

    const backgroundColors = estimateBorderMatteColors(data, border);
    if (backgroundColors === undefined) return false;

    const matchingBorderPixels = border.filter(
        (pixel) => colorDistanceToMatte(data, pixel * 4, backgroundColors) <= FEATHERED_MATTE_DISTANCE,
    ).length;
    if (matchingBorderPixels / border.length < MINIMUM_MATCHING_BORDER_RATIO) return false;

    const pixelCount = width * height;
    const queued = new Uint8Array(pixelCount);
    const queue = new Uint32Array(pixelCount);
    let queueLength = 0;
    let cursor = 0;
    let changed = false;
    const enqueue = (pixel: number): void => {
        if (queued[pixel] === 1) return;
        queued[pixel] = 1;
        queue[queueLength] = pixel;
        queueLength += 1;
    };
    for (const pixel of border) enqueue(pixel);

    while (cursor < queueLength) {
        const pixel = queue[cursor];
        cursor += 1;
        if (pixel === undefined) continue;
        const offset = pixel * 4;
        const background = closestMatteColor(data, offset, backgroundColors);
        const distance = colorDistance(data, offset, background);
        const originalAlpha = data[offset + 3];
        if (originalAlpha > TRANSPARENT_ALPHA && distance > FEATHERED_MATTE_DISTANCE) continue;

        const retainedMatteFraction =
            distance <= SOLID_MATTE_DISTANCE
                ? 0
                : Math.min(1, (distance - SOLID_MATTE_DISTANCE) / (FEATHERED_MATTE_DISTANCE - SOLID_MATTE_DISTANCE));
        const nextAlpha = Math.round(originalAlpha * retainedMatteFraction);
        if (nextAlpha !== originalAlpha) {
            data[offset + 3] = nextAlpha;
            suppressGreenSpill(data, offset, background, retainedMatteFraction);
            changed = true;
        }

        const x = pixel % width;
        const y = Math.floor(pixel / width);
        if (x > 0) enqueue(pixel - 1);
        if (x + 1 < width) enqueue(pixel + 1);
        if (y > 0) enqueue(pixel - width);
        if (y + 1 < height) enqueue(pixel + width);
    }

    // Remove the actual key colour everywhere, including a gap enclosed by a
    // staff or cape. Unlike the edge flood fill, this is an almost-exact RGB
    // match; similar hair/fabric shading remains opaque.
    if (removeExactInteriorMatte(data, backgroundColors)) changed = true;
    if (removeLowerFloorIllustration(image)) changed = true;
    return changed;
}

function removeExactInteriorMatte(data: Uint8ClampedArray, backgroundColors: readonly RgbColor[]): boolean {
    let changed = false;
    for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset + 3] <= TRANSPARENT_ALPHA) continue;
        if (colorDistanceToMatte(data, offset, backgroundColors) > EXACT_INTERIOR_MATTE_DISTANCE) continue;
        data[offset + 3] = 0;
        changed = true;
    }
    return changed;
}

/** Removes a long horizontal ground/contact stroke below a free-standing avatar. */
function removeLowerFloorIllustration(image: ImageData): boolean {
    const { width, height, data } = image;
    const minimumWidth = Math.ceil(width * MINIMUM_FLOOR_LINE_WIDTH_RATIO);
    let changed = false;
    for (let y = Math.floor(height * FLOOR_SCAN_START_RATIO); y < height; y += 1) {
        const candidates = dominantRowColors(data, width, y);
        for (const color of candidates) {
            const matchingXs: number[] = [];
            for (let x = 0; x < width; x += 1) {
                const offset = (y * width + x) * 4;
                if (
                    data[offset + 3] > TRANSPARENT_ALPHA &&
                    colorDistance(data, offset, color) <= FLOOR_COLOR_DISTANCE
                ) {
                    matchingXs.push(x);
                }
            }
            const first = matchingXs[0];
            const last = matchingXs.at(-1);
            if (first === undefined || last === undefined || last - first + 1 < minimumWidth) continue;
            if (matchingXs.length / (last - first + 1) < MINIMUM_FLOOR_LINE_DENSITY) continue;
            for (let x = first; x <= last; x += 1) {
                const offset = (y * width + x) * 4;
                if (
                    data[offset + 3] > TRANSPARENT_ALPHA &&
                    colorDistance(data, offset, color) <= FLOOR_COLOR_DISTANCE
                ) {
                    data[offset + 3] = 0;
                    changed = true;
                }
            }
        }
    }
    return changed;
}

function dominantRowColors(data: Uint8ClampedArray, width: number, y: number): readonly RgbColor[] {
    const buckets = new Map<number, number>();
    for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        if (data[offset + 3] <= TRANSPARENT_ALPHA) continue;
        const key = ((data[offset] >> 4) << 8) | ((data[offset + 1] >> 4) << 4) | (data[offset + 2] >> 4);
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    return [...buckets.entries()]
        .sort(([, left], [, right]) => right - left)
        .slice(0, 2)
        .map(([bucket]) => averageBucketColor(data, rowPixelIndexes(width, y), bucket));
}

function rowPixelIndexes(width: number, y: number): number[] {
    return Array.from({ length: width }, (_, x) => y * width + x);
}

function borderPixelIndexes(width: number, height: number): number[] {
    const pixels: number[] = [];
    for (let x = 0; x < width; x += 1) {
        pixels.push(x);
        if (height > 1) pixels.push((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
        pixels.push(y * width);
        if (width > 1) pixels.push(y * width + width - 1);
    }
    return pixels;
}

function estimateBorderMatteColors(
    data: Uint8ClampedArray,
    border: readonly number[],
): readonly RgbColor[] | undefined {
    const buckets = new Map<number, number>();
    const opaqueBorder = border.filter((pixel) => data[pixel * 4 + 3] > TRANSPARENT_ALPHA);
    for (const pixel of opaqueBorder) {
        const offset = pixel * 4;
        const key = ((data[offset] >> 4) << 8) | ((data[offset + 1] >> 4) << 4) | (data[offset + 2] >> 4);
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
    if (opaqueBorder.length === 0) {
        return undefined;
    }
    const orderedBuckets = [...buckets.entries()].sort(([, left], [, right]) => right - left);
    const [first, second] = orderedBuckets;
    if (first === undefined) return undefined;
    const patternedMatteBuckets = orderedBuckets.slice(0, MAXIMUM_PATTERNED_MATTE_COLORS);
    const patternedMatteCoverage =
        patternedMatteBuckets.reduce((total, [, count]) => total + count, 0) / opaqueBorder.length;
    if (
        first[1] / opaqueBorder.length < MINIMUM_DOMINANT_BORDER_RATIO &&
        (first[1] / opaqueBorder.length < 0.15 || patternedMatteCoverage < MINIMUM_PATTERNED_MATTE_RATIO)
    ) {
        return undefined;
    }
    if (patternedMatteCoverage >= MINIMUM_PATTERNED_MATTE_RATIO && first[1] / opaqueBorder.length < 0.8) {
        return patternedMatteBuckets.map(([bucket]) => averageBucketColor(data, opaqueBorder, bucket));
    }
    const colors = [averageBucketColor(data, opaqueBorder, first[0])];
    if (second !== undefined && (first[1] + second[1]) / opaqueBorder.length >= MINIMUM_TWO_COLOR_BORDER_RATIO) {
        colors.push(averageBucketColor(data, opaqueBorder, second[0]));
    }
    return colors;
}

function averageBucketColor(data: Uint8ClampedArray, pixels: readonly number[], bucket: number): RgbColor {
    let red = 0;
    let green = 0;
    let blue = 0;
    let count = 0;
    for (const pixel of pixels) {
        const offset = pixel * 4;
        const key = ((data[offset] >> 4) << 8) | ((data[offset + 1] >> 4) << 4) | (data[offset + 2] >> 4);
        if (key !== bucket) continue;
        red += data[offset];
        green += data[offset + 1];
        blue += data[offset + 2];
        count += 1;
    }
    return { red: red / count, green: green / count, blue: blue / count };
}

function colorDistanceToMatte(data: Uint8ClampedArray, offset: number, colors: readonly RgbColor[]): number {
    return Math.min(...colors.map((color) => colorDistance(data, offset, color)));
}

function closestMatteColor(data: Uint8ClampedArray, offset: number, colors: readonly RgbColor[]): RgbColor {
    return colors.reduce((closest, color) =>
        colorDistance(data, offset, color) < colorDistance(data, offset, closest) ? color : closest,
    );
}

function colorDistance(data: Uint8ClampedArray, offset: number, color: RgbColor): number {
    return Math.hypot(data[offset] - color.red, data[offset + 1] - color.green, data[offset + 2] - color.blue);
}

function suppressGreenSpill(
    data: Uint8ClampedArray,
    offset: number,
    background: RgbColor,
    retainedMatteFraction: number,
): void {
    if (background.green < background.red + 40 || background.green < background.blue + 40) return;
    const neutralGreen = Math.max(data[offset], data[offset + 2]);
    if (data[offset + 1] <= neutralGreen) return;
    data[offset + 1] = Math.round(neutralGreen + (data[offset + 1] - neutralGreen) * retainedMatteFraction);
}
