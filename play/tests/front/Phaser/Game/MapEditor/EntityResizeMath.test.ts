import { describe, expect, it } from "vitest";
import {
    resizeBoundsFromCorner,
    toAuthoredEntityBounds,
    toRenderedEntityBounds,
} from "../../../../../src/front/Phaser/Game/MapEditor/Entities/EntityResizeMath";

describe("resizeBoundsFromCorner", () => {
    const bounds = { x: 100, y: 80, width: 64, height: 48 };

    it("preserves the aspect ratio from the south-east by default", () => {
        expect(resizeBoundsFromCorner(bounds, "south-east", 205, 170)).toEqual({
            x: 100,
            y: 80,
            width: 110,
            height: 83,
        });
    });

    it("keeps the opposite corner fixed while preserving ratio from the north-west", () => {
        expect(resizeBoundsFromCorner(bounds, "north-west", 76, 45)).toEqual({
            x: 68,
            y: 56,
            width: 96,
            height: 72,
        });
    });

    it.each([
        ["north-east", 215, 35, { x: 100, y: 39, width: 118, height: 89 }],
        ["south-west", 35, 175, { x: 36, y: 80, width: 128, height: 96 }],
    ] as const)("preserves ratio from %s", (corner, pointerX, pointerY, expected) => {
        expect(resizeBoundsFromCorner(bounds, corner, pointerX, pointerY)).toEqual(expected);
    });

    it("resizes freely when aspect-ratio preservation is disabled", () => {
        expect(resizeBoundsFromCorner(bounds, "south-east", 205, 170, false)).toEqual({
            x: 100,
            y: 80,
            width: 105,
            height: 90,
        });
    });

    it("enforces a usable minimum size", () => {
        expect(resizeBoundsFromCorner(bounds, "north-west", 500, 500)).toEqual({
            x: 143,
            y: 112,
            width: 21,
            height: 16,
        });
    });

    it("keeps an elevated asset inside its rendered resize frame without changing its authored position", () => {
        const authoredBounds = { x: 100, y: 80, width: 64, height: 48 };
        const renderedBounds = toRenderedEntityBounds(authoredBounds, 12);

        expect(renderedBounds).toEqual({ x: 100, y: 68, width: 64, height: 48 });
        expect(toAuthoredEntityBounds(renderedBounds, 12)).toEqual(authoredBounds);
    });
});
