import { describe, expect, it } from "vitest";

import {
    createWokaIdleFrameStage,
    createWokaSpriteSheetStage,
    WOKA_SPRITE_SHEET_LAYOUT,
} from "../../../../src/front/Services/AssetGeneration/StagedWokaGeneration";
import type { AssetGenerationReference } from "../../../../src/front/Services/AssetGeneration/AssetGenerationTypes";

describe("StagedWokaGeneration", () => {
    it("requests one full-resolution down-facing design, not a sheet", () => {
        const stage = createWokaIdleFrameStage({
            modelId: "openai/gpt-image-1",
            target: "complete-woka",
            description: "A tall fox in a moss-green coat",
        });

        expect(stage).toMatchObject({
            stage: "idle-frame",
            outputSize: { width: 240, height: 240, pixelated: false },
            request: {
                modelId: "openai/gpt-image-1",
                target: "complete-woka",
                outputCount: 1,
                outputFormat: "webp",
                background: "transparent",
            },
        });
        expect(stage.request.references).toHaveLength(1);
        expect(stage.request.references[0]).toMatchObject({
            id: "default-woka-neutral-body-front-idle",
            mimeType: "image/png",
        });
        expect(stage.request.references[0]?.blob.type).toBe("image/png");
        expect(stage.request.prompt).toContain("fixed Woka front-idle pose");
        expect(stage.request.prompt).toContain("direct 0-degree front elevation facing straight into the camera");
        expect(stage.request.prompt).toContain("0-degree yaw, 0-degree pitch, and 0-degree roll");
        expect(stage.request.prompt).toContain(
            "Both eyes, ears, shoulders, hands, knees, and feet must be equally visible",
        );
        expect(stage.request.prompt).toContain("rejected three-quarter pose");
        expect(stage.request.prompt).toContain("both feet are flat on one shared horizontal ground line");
        expect(stage.request.prompt).toContain("never this direct frontal camera angle, pose, framing, limb placement");
        expect(stage.request.prompt).toContain("provider's full output resolution");
        expect(stage.request.prompt).toContain("bundled vanilla WorkAdventure Woka's unclothed neutral body");
        expect(stage.request.prompt).toContain("oversized rounded head, compact small torso, short arms and legs");
        expect(stage.request.prompt).toContain("HIGHEST-PRIORITY WOKA BODY GEOMETRY");
        expect(stage.request.prompt).toContain("never an adult-proportioned character");
        expect(stage.request.prompt).toContain("at most one quarter of the figure height");
        expect(stage.request.prompt.startsWith("HIGHEST-PRIORITY WOKA BODY GEOMETRY")).toBe(true);
        expect(stage.request.prompt).toContain("do not create a sprite sheet, grid, contact sheet");
        expect(stage.request.prompt).toContain("floor, ground plane, terrain, grass, path, pedestal, platform");
    });

    it("does not attach the tiny internal pose guide to Recraft requests", () => {
        const userReference = pngReference("user-reference");
        const withoutUserReference = createWokaIdleFrameStage({
            modelId: "recraft/recraft-v4.1",
            target: "complete-woka",
            description: "A wizard",
        });
        const withUserReference = createWokaIdleFrameStage({
            modelId: "recraft/recraft-v4.1",
            target: "complete-woka",
            description: "A wizard",
            references: [userReference],
        });

        expect(withoutUserReference.request.references).toEqual([]);
        expect(withUserReference.request.references).toEqual([userReference]);
        expect(withUserReference.request.prompt).not.toContain("canonical WorkAdventure Woka composition example");
        expect(withUserReference.request.prompt).toContain("use it only for character identity and visual style");
    });

    it("models stage 2 as the required 12-frame sheet seeded only by the accepted PNG", () => {
        const acceptedSeed = pngReference("accepted-stage-1");
        const stage = createWokaSpriteSheetStage({
            modelId: "openai/gpt-image-1",
            target: "complete-woka",
            description: "A tall fox in a moss-green coat",
            acceptedSeed,
        });

        expect(stage).toMatchObject({
            stage: "sprite-sheet",
            outputSize: { width: 96, height: 128, pixelated: true },
            layout: {
                width: 96,
                height: 128,
                frameWidth: 32,
                frameHeight: 32,
                columns: 3,
                rows: ["down", "left", "right", "up"],
                framesPerRow: 3,
            },
            request: {
                modelId: "openai/gpt-image-1",
                target: "complete-woka",
                outputCount: 1,
                references: [acceptedSeed],
                outputFormat: "webp",
                background: "transparent",
            },
        });
        expect(WOKA_SPRITE_SHEET_LAYOUT.rows).toEqual(["down", "left", "right", "up"]);
        expect(stage.request.prompt).toContain("required accepted PNG reference");
        expect(stage.request.prompt).toContain("3-column by 4-row grid");
        expect(stage.request.prompt).toContain("Order the rows exactly as down, left, right, up");
        expect(stage.request.prompt).toContain("exactly three aligned frames in each row");
        expect(stage.request.prompt).toContain("middle idle frame of the down row");
    });

    it("rejects stage 2 without an accepted PNG reference", () => {
        const nonPngSeed: AssetGenerationReference = {
            id: "unaccepted-reference",
            blob: new Blob(["not-png"], { type: "image/webp" }),
            mimeType: "image/webp",
        };

        expect(() =>
            createWokaSpriteSheetStage({
                modelId: "openai/gpt-image-1",
                target: "complete-woka",
                description: "A fox",
                acceptedSeed: nonPngSeed,
            }),
        ).toThrow("Stage 2 requires the accepted stage-1 PNG");
    });

    it("keeps a generated body isolated as a transparent component layer in both stages", () => {
        const idleStage = createWokaIdleFrameStage({
            modelId: "openai/gpt-image-1",
            target: "woka-body",
            description: "A long four-legged body",
        });
        const sheetStage = createWokaSpriteSheetStage({
            modelId: "openai/gpt-image-1",
            target: "woka-body",
            description: "A long four-legged body",
            acceptedSeed: pngReference("accepted-body"),
        });

        expect(idleStage.request.target).toBe("woka-body");
        expect(idleStage.request.prompt).toContain("only the body layer");
        expect(idleStage.request.prompt).toContain("outside that single avatar layer transparent");
        expect(sheetStage.request.target).toBe("woka-body");
        expect(sheetStage.request.prompt).toContain("Generate only the body layer");
        expect(sheetStage.request.prompt).toContain("outside that layer transparent in every frame");
    });
});

function pngReference(id: string): AssetGenerationReference {
    return {
        id,
        blob: new Blob(["png-seed"], { type: "image/png" }),
        mimeType: "image/png",
    };
}
