import { describe, expect, it, vi } from "vitest";
import {
    drawDiagonalWallProjection,
    getWallProjectionTransform,
} from "../../../../../src/front/Phaser/Game/MapEditor/Entities/WallTextureProjector";

describe("WallTextureProjector", () => {
    it("shears the complete wall image down into a diagonal face", () => {
        expect(getWallProjectionTransform(64, 64, 32, 64, 32, "diagonal-down")).toEqual({
            scaleX: 0.5,
            scaleY: 1,
            shearY: 0.5,
            offsetY: 0,
        });
    });

    it("reverses the shear direction and offsets the image for an upward diagonal", () => {
        expect(getWallProjectionTransform(64, 64, 32, 64, 32, "diagonal-up")).toEqual({
            scaleX: 0.5,
            scaleY: 1,
            shearY: -0.5,
            offsetY: 32,
        });
    });

    it("draws the full raster with crisp parallel diagonal top and bottom borders", () => {
        const setTransform = vi.fn();
        const drawImage = vi.fn();
        const fillRect = vi.fn();
        const context = {
            save: vi.fn(),
            restore: vi.fn(),
            setTransform,
            drawImage,
            fillRect,
            imageSmoothingEnabled: true,
            fillStyle: "",
        } as unknown as CanvasRenderingContext2D;
        const source = {} as CanvasImageSource;

        drawDiagonalWallProjection(context, source, 64, 64, 32, 64, 32, "diagonal-down");

        expect(setTransform).toHaveBeenCalledWith(0.5, 0.5, 0, 1, 0, 0);
        expect(drawImage).toHaveBeenCalledOnce();
        expect(drawImage).toHaveBeenCalledWith(source, 0, 0);
        expect(context.fillStyle).toBe("#000000");
        expect(fillRect).toHaveBeenCalledTimes(64);
        expect(fillRect).toHaveBeenNthCalledWith(1, 0, 0, 1, 1);
        expect(fillRect).toHaveBeenNthCalledWith(2, 0, 63, 1, 1);
        expect(fillRect).toHaveBeenNthCalledWith(63, 31, 32, 1, 1);
        expect(fillRect).toHaveBeenLastCalledWith(31, 95, 1, 1);
    });

    it("keeps a one-tile 45 degree rise when the source image is taller than the normalized wall", () => {
        const setTransform = vi.fn();
        const fillRect = vi.fn();
        const context = {
            save: vi.fn(),
            restore: vi.fn(),
            setTransform,
            drawImage: vi.fn(),
            fillRect,
            imageSmoothingEnabled: true,
            fillStyle: "",
        } as unknown as CanvasRenderingContext2D;

        drawDiagonalWallProjection(context, {} as CanvasImageSource, 1024, 2048, 32, 64, 32, "diagonal-down");

        expect(setTransform).toHaveBeenCalledWith(1 / 32, 1 / 32, 0, 1 / 32, 0, 0);
        expect(fillRect).toHaveBeenNthCalledWith(1, 0, 0, 1, 1);
        expect(fillRect).toHaveBeenNthCalledWith(2, 0, 63, 1, 1);
        expect(fillRect).toHaveBeenNthCalledWith(63, 31, 32, 1, 1);
        expect(fillRect).toHaveBeenLastCalledWith(31, 95, 1, 1);
    });

    it("runs a left-facing border from top-right to bottom-left by exactly one tile", () => {
        const fillRect = vi.fn();
        const context = {
            save: vi.fn(),
            restore: vi.fn(),
            setTransform: vi.fn(),
            drawImage: vi.fn(),
            fillRect,
            imageSmoothingEnabled: true,
            fillStyle: "",
        } as unknown as CanvasRenderingContext2D;

        drawDiagonalWallProjection(context, {} as CanvasImageSource, 64, 64, 32, 64, 32, "diagonal-up");

        expect(fillRect).toHaveBeenNthCalledWith(1, 0, 32, 1, 1);
        expect(fillRect).toHaveBeenNthCalledWith(2, 0, 95, 1, 1);
        expect(fillRect).toHaveBeenNthCalledWith(63, 31, 0, 1, 1);
        expect(fillRect).toHaveBeenLastCalledWith(31, 63, 1, 1);
    });
});
