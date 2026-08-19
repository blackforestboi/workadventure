import { describe, expect, it } from "vitest";

import { planViewportStreaming } from "../../../../../src/front/Phaser/Game/GameMap/ViewportStreamingBudget";
import {
    getExactDetailTileSpan,
    getExactDetailZoomModifierFloor,
    getFullDetailResidentPixelViewport,
    getZoomOutViewportPixelLimit,
    worldBoundsToTileViewport,
    worldViewToTileViewport,
} from "../../../../../src/front/Phaser/Game/GameMap/ViewportStreamingCameraPolicy";

describe("viewport streaming camera policy", () => {
    it("derives a deterministic 128-tile span from the default exact-detail budget", () => {
        expect(getExactDetailTileSpan()).toBe(128);
    });

    it("caps a 4000 by 4000 map while preserving the current size of small maps", () => {
        expect(getZoomOutViewportPixelLimit({ width: 128_000, height: 128_000 }, { width: 32, height: 32 })).toEqual({
            width: 4_096,
            height: 4_096,
        });
        expect(getZoomOutViewportPixelLimit({ width: 2_560, height: 1_920 }, { width: 32, height: 32 })).toEqual({
            width: 2_560,
            height: 1_920,
        });
    });

    it("retains the editor workspace scale while it remains inside the exact-detail span", () => {
        expect(getZoomOutViewportPixelLimit({ width: 1_280, height: 960 }, { width: 32, height: 32 }, 2)).toEqual({
            width: 2_560,
            height: 1_920,
        });
    });

    it("uses the stricter screen axis when deriving the exact-detail zoom floor", () => {
        expect(
            getExactDetailZoomModifierFloor(
                { width: 128_000, height: 128_000 },
                { width: 32, height: 32 },
                { width: 1_920, height: 1_080 },
                1,
                1,
            ),
        ).toBe(1_920 / 4_096);

        expect(
            getExactDetailZoomModifierFloor(
                { width: 2_560, height: 1_920 },
                { width: 32, height: 32 },
                { width: 1_920, height: 1_080 },
                1,
                1,
            ),
        ).toBe(0);
    });

    it("turns signed, fractional world views into stable integer tile bounds", () => {
        expect(worldViewToTileViewport({ x: -33, y: -1, width: 65, height: 33 }, { width: 32, height: 32 })).toEqual({
            x: -2,
            y: -1,
            width: 3,
            height: 2,
        });
        expect(
            worldBoundsToTileViewport({ x: -4_096, y: -2_048, width: 8_192, height: 4_096 }, { width: 32, height: 32 }),
        ).toEqual({ x: -128, y: -64, width: 256, height: 128 });
    });

    it("bounds multiplayer interest to the selected full-detail chunks and signed map edges", () => {
        const plan = planViewportStreaming({ x: -96, y: -32, width: 128, height: 64 }, 1, {
            haloChunks: 0,
            worldBounds: { x: -100, y: -50, width: 200, height: 100 },
        });

        expect(
            getFullDetailResidentPixelViewport(
                plan,
                { width: 32, height: 32 },
                {
                    x: -3_200,
                    y: -1_600,
                    width: 6_400,
                    height: 3_200,
                },
            ),
        ).toEqual({ left: -3_200, top: -1_600, right: 2_048, bottom: 1_600 });
    });

    it("rejects invalid zoom budget inputs", () => {
        expect(() => getExactDetailTileSpan(0)).toThrow("exactVisibleTileLimit must be a positive safe integer");
        expect(() => getZoomOutViewportPixelLimit({ width: 1, height: 1 }, { width: 0, height: 32 })).toThrow(
            "tileDimensions.width must be positive and finite",
        );
    });
});
