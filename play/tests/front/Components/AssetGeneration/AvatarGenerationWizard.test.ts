import { describe, expect, it } from "vitest";

import wizardSource from "../../../../src/front/Components/AssetGeneration/AvatarGenerationWizard.svelte?raw";

describe("avatar generation wizard editor", () => {
    it("opens the full frame editor immediately after generating the core design", () => {
        expect(wizardSource).toContain("setDirectionFrame(1, preserved)");
        expect(wizardSource).toContain('step = "directions"');
        expect(wizardSource).not.toContain("Does this design look right?");
        expect(wizardSource).not.toContain('step = "review-design"');
    });

    it("presents the front-facing generated frame first in a large three-column grid", () => {
        expect(wizardSource).toContain("[1, 0, 2, 10, 9, 11, 4, 3, 5, 7, 6, 8]");
        expect(wizardSource).toContain("max-w-6xl");
        expect(wizardSource).toContain("lg:grid-cols-3");
        expect(wizardSource).toContain("Core design");
    });

    it("offers bulk generation plus AI and upload controls on every frame", () => {
        expect(wizardSource).toContain("Generate all");
        expect(wizardSource).toContain("Generate with AI");
        expect(wizardSource).toContain("Upload asset");
        expect(wizardSource).toContain("handleFrameUpload(item.index, event.currentTarget)");
        expect(wizardSource).toContain('accept="image/png,image/jpeg,image/webp"');
    });

    it("keeps manually supplied right-facing frames when generating the missing set", () => {
        expect(wizardSource).toContain("if (directionFrames[6] === null)");
        expect(wizardSource).toContain("if (directionFrames[8] === null)");
        expect(wizardSource).not.toContain("replaceRightFramesWithMirrors");
    });
});
