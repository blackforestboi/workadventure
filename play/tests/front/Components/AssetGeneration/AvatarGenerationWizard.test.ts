import { describe, expect, it } from "vitest";

import wizardSource from "../../../../src/front/Components/AssetGeneration/AvatarGenerationWizard.svelte?raw";

describe("avatar generation wizard editor", () => {
    it("opens the full frame editor immediately after generating the core design", () => {
        expect(wizardSource).toContain("setDirectionFrame(1, preserved)");
        expect(wizardSource).toContain('step = "directions"');
        expect(wizardSource).not.toContain("Does this design look right?");
        expect(wizardSource).not.toContain('step = "review-design"');
    });

    it("presents only Front, Back, and Side source rows in a large three-column grid", () => {
        expect(wizardSource).toContain("[1, 0, 2, 10, 9, 11, 4, 3, 5]");
        expect(wizardSource).not.toContain("[1, 0, 2, 10, 9, 11, 4, 3, 5, 7, 6, 8]");
        expect(wizardSource).toContain("max-w-6xl");
        expect(wizardSource).toContain("lg:grid-cols-3");
        expect(wizardSource).toContain("Core design");
        expect(wizardSource).toContain('if (direction === "left") return "Side"');
        expect(wizardSource).toContain("Side frames always face left");
    });

    it("offers bulk generation plus AI and upload controls on every frame", () => {
        expect(wizardSource).toContain("Generate all");
        expect(wizardSource).toContain("Generate with AI");
        expect(wizardSource).toContain("Upload asset");
        expect(wizardSource).toContain("handleFrameUpload(item.index, event.currentTarget)");
        expect(wizardSource).toContain('accept="image/png,image/jpeg,image/webp"');
    });

    it("contains uploaded frame assets instead of stretching them", () => {
        expect(wizardSource).toContain('resizeMode: "contain"');
    });

    it("keeps other frame actions available while one frame generates", () => {
        const regenerateFrameSource = wizardSource.slice(
            wizardSource.indexOf("async function regenerateFrame"),
            wizardSource.indexOf("async function uploadFrame"),
        );
        expect(regenerateFrameSource).not.toContain("controller = generationController");
        expect(regenerateFrameSource).toContain("frameControllers.set(index, generationController)");
        expect(regenerateFrameSource).toContain("frameControllers.delete(index)");
        expect(wizardSource).toContain("for (const frameController of frameControllers.values())");
    });

    it("always derives the hidden right-facing output from the left-facing Side row", () => {
        expect(wizardSource).toContain("for (const sideIndex of [3, 4, 5] as const)");
        expect(wizardSource).toContain("return index >= 3 && index <= 5 ? index + 3 : undefined");
        expect(wizardSource).toContain("setDirectionFrame(rightIndex, await mirrorWokaFrameHorizontally(blob))");
        expect(wizardSource).toContain("await setEditableDirectionFrame(index, normalized)");
        expect(wizardSource).toContain("await setEditableDirectionFrame(index, consistent)");
        expect(wizardSource).not.toContain("if (directionFrames[6] === null)");
        expect(wizardSource).not.toContain("if (directionFrames[8] === null)");
    });
});
