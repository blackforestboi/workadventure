// @vitest-environment node

import { describe, expect, it } from "vitest";

import { validateTeapotWokaPng } from "../../src/pusher/teapot/TeapotWokaPngValidator";
import { createTestWokaPng } from "./fixtures/createTestWokaPng";

describe("validateTeapotWokaPng", () => {
    it("accepts a transparent 96x128 RGBA 12-frame sheet", () => {
        const png = createTestWokaPng();

        const validated = validateTeapotWokaPng(png);

        expect(validated).toMatchObject({
            width: 96,
            height: 128,
            frameWidth: 32,
            frameHeight: 32,
            frameColumns: 3,
            frameRows: 4,
        });
        expect(validated.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(validated.bytes).toEqual(png);
        expect(validated.bytes).not.toBe(png);
    });

    it("preserves a higher-resolution 3x4 sheet", () => {
        const validated = validateTeapotWokaPng(createTestWokaPng({ width: 192, height: 256 }));

        expect(validated).toMatchObject({ width: 192, height: 256, frameWidth: 64, frameHeight: 64 });
    });

    it("rejects dimensions that are not a 3x4 grid of square frames", () => {
        expect(() => validateTeapotWokaPng(createTestWokaPng({ width: 64 }))).toThrow(
            "Woka sprite sheet must contain an exact 3x4 frame grid",
        );
        expect(() => validateTeapotWokaPng(createTestWokaPng({ width: 192, height: 128 }))).toThrow(
            "Woka animation frames must be square",
        );
    });

    it("rejects an opaque image and a fully transparent image", () => {
        expect(() => validateTeapotWokaPng(createTestWokaPng({ transparent: false }))).toThrow(
            "Woka PNG must contain transparent pixels",
        );
        expect(() => validateTeapotWokaPng(createTestWokaPng({ visible: false }))).toThrow(
            "Woka PNG cannot be fully transparent",
        );
    });

    it("rejects a sheet with an empty animation frame", () => {
        expect(() => validateTeapotWokaPng(createTestWokaPng({ emptyFrame: 7 }))).toThrow(
            "Each of the 12 Woka animation frames must contain visible pixels",
        );
    });

    it("rejects corrupt chunk data before decoding", () => {
        const png = createTestWokaPng();
        const imageDataOffset = png.indexOf(Buffer.from("IDAT")) + 4;
        png[imageDataOffset] = (png[imageDataOffset] ?? 0) ^ 0xff;

        expect(() => validateTeapotWokaPng(png)).toThrow("PNG IDAT chunk has an invalid checksum");
    });
});
