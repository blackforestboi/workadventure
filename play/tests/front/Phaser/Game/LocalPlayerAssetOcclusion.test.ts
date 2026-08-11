import { describe, expect, it, vi } from "vitest";
import {
    LocalPlayerAssetOcclusion,
    type LocalOcclusionObject,
} from "../../../../src/front/Phaser/Game/LocalPlayerAssetOcclusion";

function createObject({
    x = 0,
    y = 0,
    width = 32,
    height = 32,
    depth = 0,
    alpha = 1,
}: Partial<{ x: number; y: number; width: number; height: number; depth: number; alpha: number }> = {}) {
    const object: LocalOcclusionObject & { setAlpha: ReturnType<typeof vi.fn> } = {
        alpha,
        depth,
        active: true,
        getBounds: () => ({ x, y, width, height }),
        setAlpha: vi.fn((nextAlpha: number) => {
            object.alpha = nextAlpha;
            return object;
        }),
    };
    return object;
}

describe("LocalPlayerAssetOcclusion", () => {
    it("fades an overlapping asset that renders in front of the local player", () => {
        const occlusion = new LocalPlayerAssetOcclusion();
        const localPlayer = createObject({ depth: 16 });
        const asset = createObject({ depth: 32 });

        expect(occlusion.update(localPlayer.depth, localPlayer.getBounds(), [asset])).toBe(true);
        expect(asset.alpha).toBe(0.6);
    });

    it("does not fade assets behind the local player or outside its bounds", () => {
        const occlusion = new LocalPlayerAssetOcclusion();
        const localPlayer = createObject({ depth: 16 });
        const assetBehind = createObject({ depth: 15 });
        const assetOutside = createObject({ x: 100, depth: 32 });

        expect(occlusion.update(localPlayer.depth, localPlayer.getBounds(), [assetBehind, assetOutside])).toBe(false);
        expect(assetBehind.alpha).toBe(1);
        expect(assetOutside.alpha).toBe(1);
    });

    it("restores the exact previous opacity after the local player leaves", () => {
        const occlusion = new LocalPlayerAssetOcclusion();
        const localPlayer = createObject({ depth: 16 });
        const asset = createObject({ depth: 32, alpha: 0.8 });

        occlusion.update(localPlayer.depth, localPlayer.getBounds(), [asset]);
        asset.depth = 15;

        expect(occlusion.update(localPlayer.depth, localPlayer.getBounds(), [asset])).toBe(true);
        expect(asset.alpha).toBe(0.8);
    });

    it("never makes an already transparent asset more opaque", () => {
        const occlusion = new LocalPlayerAssetOcclusion();
        const localPlayer = createObject({ depth: 16 });
        const asset = createObject({ depth: 32, alpha: 0.4 });

        expect(occlusion.update(localPlayer.depth, localPlayer.getBounds(), [asset])).toBe(false);
        expect(asset.alpha).toBe(0.4);
    });

    it("updates several assets independently and avoids repeated writes on stable frames", () => {
        const occlusion = new LocalPlayerAssetOcclusion();
        const localPlayer = createObject({ depth: 16 });
        const firstAsset = createObject({ depth: 32 });
        const secondAsset = createObject({ depth: 48 });

        expect(occlusion.update(localPlayer.depth, localPlayer.getBounds(), [firstAsset, secondAsset])).toBe(true);
        expect(occlusion.update(localPlayer.depth, localPlayer.getBounds(), [firstAsset, secondAsset])).toBe(false);
        expect(firstAsset.setAlpha).toHaveBeenCalledTimes(1);
        expect(secondAsset.setAlpha).toHaveBeenCalledTimes(1);
    });

    it("restores a live asset that is removed from the entity collection", () => {
        const occlusion = new LocalPlayerAssetOcclusion();
        const localPlayer = createObject({ depth: 16 });
        const asset = createObject({ depth: 32 });

        occlusion.update(localPlayer.depth, localPlayer.getBounds(), [asset]);

        expect(occlusion.update(localPlayer.depth, localPlayer.getBounds(), [])).toBe(true);
        expect(asset.alpha).toBe(1);
    });
});
