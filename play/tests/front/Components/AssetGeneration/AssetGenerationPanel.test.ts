import { describe, expect, it } from "vitest";

import assetGenerationPanelSource from "../../../../src/front/Components/AssetGeneration/AssetGenerationPanel.svelte?raw";

describe("asset generation panel", () => {
    it("only opens AI settings in response to an explicit user action", () => {
        expect(assetGenerationPanelSource).not.toMatch(
            /\$effect\(\(\) => \{\s*if \(\$assetGenerationSettings\.initialized && readySelection === undefined\)/,
        );
        expect(assetGenerationPanelSource).toMatch(
            /function requestApproval\(\)[\s\S]*?if \(selection === undefined\)[\s\S]*?aiGenerationSettingsVisibilityStore\.open\(\)/,
        );
        expect(assetGenerationPanelSource).toContain(">Open AI settings</Button");
    });
});
