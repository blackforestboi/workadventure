import { describe, expect, it } from "vitest";

import {
    EntityRawPrefab,
    VisualAssetAnimation,
    getVisualAssetAnimationSourceDimensions,
    isVisualAssetAnimationStatic,
    toPhaserVisualAssetAnimationFrames,
    toTiledVisualAssetAnimationFrames,
} from "../src/types";

const animatedStrip = {
    frameWidth: 32,
    frameHeight: 48,
    frameCount: 4,
    frameDurationMs: 200,
};

describe("VisualAssetAnimation", () => {
    it("keeps existing entity prefabs static when metadata is absent", () => {
        const prefab = EntityRawPrefab.parse({
            id: "chair",
            name: "Chair",
            tags: ["furniture"],
            imagePath: "/chair.png",
            direction: "Down",
            color: "#ffffff",
        });

        expect(prefab.animation).toBeUndefined();
        expect(isVisualAssetAnimationStatic(prefab.animation)).toBe(true);
    });

    it("describes one four-frame horizontal strip for Phaser and Tiled", () => {
        const animation = VisualAssetAnimation.parse(animatedStrip);

        expect(getVisualAssetAnimationSourceDimensions(animation)).toEqual({ width: 128, height: 48 });
        expect(toPhaserVisualAssetAnimationFrames(animation, "water")).toEqual([
            { key: "water", frame: 0, duration: 200 },
            { key: "water", frame: 1, duration: 200 },
            { key: "water", frame: 2, duration: 200 },
            { key: "water", frame: 3, duration: 200 },
        ]);
        expect(toTiledVisualAssetAnimationFrames(animation, 7)).toEqual([
            { tileid: 7, duration: 200 },
            { tileid: 8, duration: 200 },
            { tileid: 9, duration: 200 },
            { tileid: 10, duration: 200 },
        ]);
    });

    it.each([
        ["zero frame width", { ...animatedStrip, frameWidth: 0 }],
        ["negative frame height", { ...animatedStrip, frameHeight: -1 }],
        ["one frame", { ...animatedStrip, frameCount: 1 }],
        ["too many frames", { ...animatedStrip, frameCount: 9 }],
        ["too-short duration", { ...animatedStrip, frameDurationMs: 0 }],
    ])("rejects %s", (_label, value) => {
        expect(VisualAssetAnimation.safeParse(value).success).toBe(false);
    });

    it("keeps placement dimensions out of source metadata", () => {
        const animation = VisualAssetAnimation.parse({ ...animatedStrip, width: 320, height: 160 });

        expect(animation).not.toHaveProperty("width");
        expect(animation).not.toHaveProperty("height");
    });
});
