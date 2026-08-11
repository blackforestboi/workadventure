import { describe, expect, it } from "vitest";

import { usesHighResolutionWokaFrames } from "../../../../src/front/Phaser/Entity/PlayerTexturesLoadingManager";

describe("PlayerTexturesLoadingManager", () => {
    it("keeps legacy pixel sprites separate from full-resolution generated frames", () => {
        expect(usesHighResolutionWokaFrames(32, 32)).toBe(false);
        expect(usesHighResolutionWokaFrames(512, 512)).toBe(true);
        expect(usesHighResolutionWokaFrames(240, 240)).toBe(true);
    });
});
