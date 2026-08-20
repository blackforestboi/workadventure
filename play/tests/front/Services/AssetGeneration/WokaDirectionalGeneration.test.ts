import { describe, expect, it } from "vitest";

import {
    createDirectionalFrameRequest,
    mirrorRgbaPixelsHorizontally,
    neutralAnchorFrameIndex,
    WOKA_DIRECTIONAL_FRAMES,
    WOKA_NEUTRAL_FRAME_INDEXES,
    WOKA_STEP_FRAME_INDEXES,
} from "../../../../src/front/Services/AssetGeneration/WokaDirectionalGeneration";
import type { AssetGenerationReference } from "../../../../src/front/Services/AssetGeneration/AssetGenerationTypes";

describe("WokaDirectionalGeneration", () => {
    it("defines the exact 3x4 WorkAdventure frame order", () => {
        expect(WOKA_DIRECTIONAL_FRAMES).toHaveLength(12);
        expect(WOKA_DIRECTIONAL_FRAMES.map(({ direction }) => direction)).toEqual([
            "down",
            "down",
            "down",
            "left",
            "left",
            "left",
            "right",
            "right",
            "right",
            "up",
            "up",
            "up",
        ]);
        expect(WOKA_DIRECTIONAL_FRAMES.map(({ column }) => column)).toEqual([0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2]);
        expect(new Set(WOKA_DIRECTIONAL_FRAMES.map(({ poseDescription }) => poseDescription)).size).toBe(12);
        expect(WOKA_DIRECTIONAL_FRAMES.every(({ poseDescription }) => poseDescription.length > 80)).toBe(true);
    });

    it("generates neutral orientation anchors before their dependent walking steps", () => {
        expect(WOKA_NEUTRAL_FRAME_INDEXES).toEqual([4, 7, 10]);
        expect(WOKA_STEP_FRAME_INDEXES).toEqual([0, 2, 3, 5, 6, 8, 9, 11]);
        expect(neutralAnchorFrameIndex(0)).toBe(1);
        expect(neutralAnchorFrameIndex(5)).toBe(4);
        expect(neutralAnchorFrameIndex(8)).toBe(7);
        expect(neutralAnchorFrameIndex(9)).toBe(10);
    });

    it("uses the approved avatar for style and the bundled frame for pose only", () => {
        const avatar = reference("approved-avatar");
        const pose = reference("pose-only");
        const request = createDirectionalFrameRequest(
            "gpt-test",
            "A fox botanist",
            "Clean cartoon style",
            avatar,
            pose,
            { width: 1024, height: 1024 },
            WOKA_DIRECTIONAL_FRAMES[4],
        );

        expect(request.references).toEqual([avatar, pose]);
        expect(request.prompt).toContain("first reference is the approved neutral orientation anchor");
        expect(request.prompt).toContain("second reference is an enlarged crop");
        expect(request.prompt).toContain("mandatory Woka body container");
        expect(request.prompt).toContain("large rounded head occupying roughly the upper half of the figure");
        expect(request.prompt).toContain("Do NOT copy its face, hair, clothing, skin color");
        expect(request.prompt).toContain("facing left in the idle pose");
        expect(request.prompt).toContain("Strict left-facing profile");
        expect(request.prompt).toContain("Direction convention is screen-relative");
        expect(request.prompt).toContain("Fixed Woka animation contract");
        expect(request.prompt).toContain("same scale as every other frame");
        expect(request.prompt).toContain("feet on one shared horizontal baseline");
        expect(request.prompt).toContain("Step A and Step B must invert the instructed hand swing and foot placement");
        expect(request.prompt).toContain("bundled, fully clothed vanilla Woka walk cycle");
        expect(request.prompt).toContain("transfer its body shape and pose only");
        expect(request.prompt).toContain("exact 1024x1024 source resolution");
        expect(request.prompt).toContain("Do not create a sprite sheet");
        expect(request.prompt).toContain("floor, ground plane, terrain, grass, path, pedestal, platform");
    });

    it("mirrors every RGBA pixel horizontally for right-facing frames", () => {
        const pixels = new Uint8ClampedArray([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

        mirrorRgbaPixelsHorizontally(pixels, 3, 1);

        expect([...pixels]).toEqual([9, 10, 11, 12, 5, 6, 7, 8, 1, 2, 3, 4]);
    });

    it("uses only the camera-facing arm and foot as the simple left-walk control", () => {
        const avatar = reference("approved-avatar");
        const pose = reference("pose-only");
        const stepA = createDirectionalFrameRequest(
            "test-model",
            "A wizard",
            "Cartoon",
            avatar,
            pose,
            { width: 512, height: 512 },
            WOKA_DIRECTIONAL_FRAMES[3],
        );
        const stepB = createDirectionalFrameRequest(
            "test-model",
            "A wizard",
            "Cartoon",
            avatar,
            pose,
            { width: 512, height: 512 },
            WOKA_DIRECTIONAL_FRAMES[5],
        );

        expect(stepA.prompt).toContain("camera-facing (nearest, fully visible) arm and hand");
        expect(stepA.prompt).toContain("swing that hand FORWARD toward SCREEN-LEFT");
        expect(stepA.prompt).toContain("camera-facing foot as the primary step: extend that foot FORWARD");
        expect(stepB.prompt).toContain("swing that hand BACK toward SCREEN-RIGHT");
        expect(stepB.prompt).toContain("camera-facing foot as the primary step: place that foot BACK");
        expect(stepB.prompt).toContain("exact opposite of left step A");
        expect(stepA.prompt).toContain(
            "for SIDE views, follow the direction-specific camera-facing arm and foot instruction",
        );
        expect(stepA.prompt).toContain("Canonical Side-view rule: generate only a strict LEFT-facing profile");
        expect(stepA.prompt).toContain("right-facing output is created later by an exact horizontal pixel mirror");
        expect(stepA.prompt).toContain("For FRONT and BACK views, follow the explicit biological LEFT/RIGHT");
    });

    it("spells out screen-relative feet and arms for the two front walking extremes", () => {
        const avatar = reference("approved-avatar");
        const pose = reference("pose-only");
        const stepA = createDirectionalFrameRequest(
            "test-model",
            "A wizard",
            "Cartoon",
            avatar,
            pose,
            { width: 512, height: 512 },
            WOKA_DIRECTIONAL_FRAMES[0],
        );
        const stepB = createDirectionalFrameRequest(
            "test-model",
            "A wizard",
            "Cartoon",
            avatar,
            pose,
            { width: 512, height: 512 },
            WOKA_DIRECTIONAL_FRAMES[2],
        );

        expect(stepA.prompt).toContain("biological LEFT appears on SCREEN-RIGHT");
        expect(stepA.prompt).toContain("SCREEN-RIGHT (biological LEFT) arm is swung BACK");
        expect(stepA.prompt).toContain("SCREEN-LEFT (biological RIGHT) arm and hand are swung FORWARD");
        expect(stepB.prompt).toContain("biological RIGHT appears on SCREEN-LEFT");
        expect(stepB.prompt).toContain("SCREEN-LEFT (biological RIGHT) arm is swung BACK");
        expect(stepB.prompt).toContain("SCREEN-RIGHT (biological LEFT) arm and hand are swung FORWARD");
        expect(stepA.prompt).toContain("if both feet are level, parallel, or equally forward this frame is wrong");
        expect(stepB.prompt).toContain("exact opposite of down step A");
    });

    it("uses the completed Step A as the primary reference for Step B", () => {
        const stepA = reference("completed-left-step-a");
        const pose = reference("vanilla-left-step-b");
        const request = createDirectionalFrameRequest(
            "test-model",
            "A wizard",
            "Cartoon",
            stepA,
            pose,
            { width: 512, height: 512 },
            WOKA_DIRECTIONAL_FRAMES[5],
            true,
        );

        expect(request.references).toEqual([stepA, pose]);
        expect(request.prompt).toContain("first reference is this direction's already-completed Step A image");
        expect(request.prompt).toContain("privately INSPECT that Step A image");
        expect(request.prompt).toContain("compare it with the second reference");
        expect(request.prompt).toContain("exact OPPOSITE contact");
        expect(request.prompt).toContain("Step B is invalid if it keeps Step A's foot/arm silhouette");
    });
});

function reference(id: string): AssetGenerationReference {
    return {
        id,
        blob: new Blob([id], { type: "image/png" }),
        mimeType: "image/png",
        role: "object-reference",
    };
}
