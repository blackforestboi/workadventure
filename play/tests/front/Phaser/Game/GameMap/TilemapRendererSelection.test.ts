import { describe, expect, it } from "vitest";
import { canUseGpuTilemapRenderer } from "../../../../../src/front/Phaser/Game/GameMap/TilemapRendererSelection";

describe("tilemap renderer selection", () => {
    it("keeps expandable maps on the renderer that supports a changing origin", () => {
        expect(canUseGpuTilemapRenderer({}, 32, 32, true)).toBe(false);
    });

    it("rejects GPU rendering for an existing pixel offset", () => {
        expect(canUseGpuTilemapRenderer({ offsetx: -512, offsety: -416 }, 32, 32, false)).toBe(false);
    });

    it("rejects GPU rendering for an existing tile offset", () => {
        expect(canUseGpuTilemapRenderer({ x: -2, y: 1 }, 32, 32, false)).toBe(false);
    });

    it("allows GPU rendering for a fixed layer at the world origin", () => {
        expect(canUseGpuTilemapRenderer({}, 32, 32, false)).toBe(true);
    });
});
