import { describe, expect, it } from "vitest";

import customizeSceneSource from "../../../../src/front/Components/Woka/WokaCustomizeScene.svelte?raw";
import selectSceneSource from "../../../../src/front/Components/Woka/WokaSelectScene.svelte?raw";

const entrypoints = [
    ["WokaSelectScene.svelte", selectSceneSource],
    ["WokaCustomizeScene.svelte", customizeSceneSource],
] as const;

describe("avatar generation entrypoints", () => {
    it.each(entrypoints)("routes %s through the shared avatar wizard", (_entrypoint, source) => {
        expect(source).toContain("AvatarGenerationWizard");
        expect(source).not.toContain("AssetGenerationPanel");
    });
});
