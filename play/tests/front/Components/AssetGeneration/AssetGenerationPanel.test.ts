import { describe, expect, it } from "vitest";

import assetGenerationPanelSource from "../../../../src/front/Components/AssetGeneration/AssetGenerationPanel.svelte?raw";
import entityEditorPickerSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityEditorPicker.svelte?raw";
import entityUploadSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityUpload/EntityUpload.svelte?raw";

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

    it("provides a compact map-object generation layout without changing the default panel", () => {
        expect(assetGenerationPanelSource).toContain("compact = false");
        expect(assetGenerationPanelSource).toMatch(/compact\s*\?\s*"Generate"/);
        expect(assetGenerationPanelSource).toContain(
            'compact ? "mt-3 flex items-center justify-between gap-2" : "mt-3 flex flex-wrap gap-2"',
        );
        expect(assetGenerationPanelSource).toContain("&& !compact");

        expect(entityUploadSource).toContain('title="Generate with AI"');
        expect(entityUploadSource).toContain("compact");
        expect(entityUploadSource).not.toContain("uploadEntity.title()");
        expect(entityUploadSource).not.toContain("uploadEntity.description()");

        expect(entityEditorPickerSource).toContain('class="px-3 pb-3"');
        expect(entityEditorPickerSource).not.toContain(
            'class="min-h-full rounded-2xl border border-white/10 bg-black/10 p-3"',
        );
    });
});
