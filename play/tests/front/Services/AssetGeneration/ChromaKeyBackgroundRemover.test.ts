import { describe, expect, it } from "vitest";

import { removeEdgeConnectedBackground } from "../../../../src/front/Services/AssetGeneration/ChromaKeyBackgroundRemover";

describe("removeEdgeConnectedBackground", () => {
    it("leaves an already transparent image unchanged", () => {
        const image = createImage(5, 5, [0, 255, 0, 0]);
        setPixel(image, 2, 2, [220, 40, 40, 255]);
        const before = new Uint8ClampedArray(image.data);

        expect(removeEdgeConnectedBackground(image)).toBe(false);
        expect(image.data).toEqual(before);
    });

    it("removes a uniform chroma matte connected to the image edge", () => {
        const image = createImage(5, 5, [0, 255, 0, 255]);
        setPixel(image, 2, 2, [220, 40, 40, 255]);

        expect(removeEdgeConnectedBackground(image)).toBe(true);
        expect(alphaAt(image, 0, 0)).toBe(0);
        expect(alphaAt(image, 4, 4)).toBe(0);
        expect(alphaAt(image, 2, 2)).toBe(255);
    });

    it("removes a long lower ground line while preserving the avatar", () => {
        const image = createImage(20, 20, [0, 0, 0, 0]);
        for (let y = 8; y <= 16; y += 1) {
            for (let x = 8; x <= 11; x += 1) setPixel(image, x, y, [220, 40, 40, 255]);
        }
        for (let x = 2; x <= 17; x += 1) setPixel(image, x, 17, [30, 130, 70, 255]);

        expect(removeEdgeConnectedBackground(image)).toBe(true);
        expect(alphaAt(image, 2, 17)).toBe(0);
        expect(alphaAt(image, 10, 16)).toBe(255);
    });

    it("removes an exact matte-colored pocket enclosed inside the subject", () => {
        const image = createImage(7, 7, [0, 255, 0, 255]);
        for (let y = 2; y <= 4; y += 1) {
            for (let x = 2; x <= 4; x += 1) setPixel(image, x, y, [180, 30, 30, 255]);
        }
        setPixel(image, 3, 3, [0, 255, 0, 255]);

        removeEdgeConnectedBackground(image);

        expect(alphaAt(image, 0, 0)).toBe(0);
        expect(alphaAt(image, 3, 3)).toBe(0);
    });

    it("preserves an enclosed color that merely resembles the matte", () => {
        const image = createImage(7, 7, [0, 255, 0, 255]);
        for (let y = 2; y <= 4; y += 1) {
            for (let x = 2; x <= 4; x += 1) setPixel(image, x, y, [180, 30, 30, 255]);
        }
        // Close to green, but not the actual chroma-key RGB value.
        setPixel(image, 3, 3, [0, 245, 0, 255]);

        removeEdgeConnectedBackground(image);

        expect(alphaAt(image, 3, 3)).toBe(255);
    });

    it("removes an edge-connected checkerboard transparency preview", () => {
        const image = createImage(7, 7, [36, 49, 69, 255]);
        for (let y = 0; y < image.height; y += 1) {
            for (let x = 0; x < image.width; x += 1) {
                setPixel(image, x, y, (x + y) % 2 === 0 ? [36, 49, 69, 255] : [68, 83, 105, 255]);
            }
        }
        for (let y = 2; y <= 4; y += 1) {
            for (let x = 2; x <= 4; x += 1) setPixel(image, x, y, [220, 40, 40, 255]);
        }

        expect(removeEdgeConnectedBackground(image)).toBe(true);
        expect(alphaAt(image, 0, 0)).toBe(0);
        expect(alphaAt(image, 6, 6)).toBe(0);
        expect(alphaAt(image, 3, 3)).toBe(255);
    });

    it("removes a three-colour raster transparency preview", () => {
        const image = createImage(7, 7, [24, 39, 59, 255]);
        const raster: [number, number, number, number][] = [
            [24, 39, 59, 255],
            [48, 70, 96, 255],
            [76, 98, 124, 255],
        ];
        for (let y = 0; y < image.height; y += 1) {
            for (let x = 0; x < image.width; x += 1)
                setPixel(image, x, y, raster[(x + y) % raster.length] ?? raster[0]);
        }
        for (let y = 2; y <= 4; y += 1) {
            for (let x = 2; x <= 4; x += 1) setPixel(image, x, y, [220, 40, 40, 255]);
        }

        expect(removeEdgeConnectedBackground(image)).toBe(true);
        expect(alphaAt(image, 0, 0)).toBe(0);
        expect(alphaAt(image, 6, 6)).toBe(0);
        expect(alphaAt(image, 3, 3)).toBe(255);
    });

    it("does not guess when the image border has no dominant matte color", () => {
        const image = createImage(5, 5, [30, 30, 30, 255]);
        const colors: [number, number, number, number][] = [
            [255, 0, 0, 255],
            [0, 255, 0, 255],
            [0, 0, 255, 255],
            [255, 255, 0, 255],
        ];
        let colorIndex = 0;
        for (let y = 0; y < image.height; y += 1) {
            for (let x = 0; x < image.width; x += 1) {
                if (x !== 0 && y !== 0 && x !== image.width - 1 && y !== image.height - 1) continue;
                setPixel(image, x, y, colors[colorIndex % colors.length] ?? colors[0]);
                colorIndex += 1;
            }
        }
        const before = new Uint8ClampedArray(image.data);

        expect(removeEdgeConnectedBackground(image)).toBe(false);
        expect(image.data).toEqual(before);
    });

    it("feathers the matte boundary and suppresses green spill", () => {
        const image = createImage(5, 5, [0, 255, 0, 255]);
        setPixel(image, 2, 2, [220, 40, 40, 255]);
        setPixel(image, 2, 1, [20, 205, 20, 255]);

        removeEdgeConnectedBackground(image);

        const offset = (1 * image.width + 2) * 4;
        expect(image.data[offset + 3]).toBeGreaterThan(0);
        expect(image.data[offset + 3]).toBeLessThan(255);
        expect(image.data[offset + 1]).toBeLessThan(205);
    });
});

function createImage(width: number, height: number, color: [number, number, number, number]): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel += 1) data.set(color, pixel * 4);
    return { width, height, data, colorSpace: "srgb" };
}

function setPixel(image: ImageData, x: number, y: number, color: [number, number, number, number]): void {
    image.data.set(color, (y * image.width + x) * 4);
}

function alphaAt(image: ImageData, x: number, y: number): number {
    return image.data[(y * image.width + x) * 4 + 3];
}
