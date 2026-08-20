import { describe, expect, it } from "vitest";

import assetGenerationPanelSource from "../../../../src/front/Components/AssetGeneration/AssetGenerationPanel.svelte?raw";
import entityEditorPickerSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityEditorPicker.svelte?raw";
import entityUploadSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityUpload/EntityUpload.svelte?raw";
import entityPropertiesEditorSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityPropertiesEditor.svelte?raw";
import customEntityEditionFormSource from "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.svelte?raw";

describe("asset generation panel", () => {
    it("only opens AI settings in response to an explicit user action", () => {
        expect(assetGenerationPanelSource).not.toMatch(
            /\$effect\(\(\) => \{\s*if \(\$assetGenerationSettings\.initialized && readySelection === undefined\)/,
        );
        expect(assetGenerationPanelSource).toMatch(
            /function requestGeneration\(\)[\s\S]*?if \(selection === undefined\)[\s\S]*?aiGenerationSettingsVisibilityStore\.open\(\)/,
        );
        expect(assetGenerationPanelSource).toContain(">Open AI settings</Button");
    });

    it("generates immediately without showing an approval dialog", () => {
        expect(assetGenerationPanelSource).toContain("generate(selection).catch");
        expect(assetGenerationPanelSource).toContain("titlePrompt: prompt");
        expect(assetGenerationPanelSource).not.toContain("Approve and generate");
        expect(assetGenerationPanelSource).not.toContain('aria-label="Approve paid generation"');
    });

    it("shows an image-sized loading placeholder while generation is in progress", () => {
        expect(assetGenerationPanelSource).toContain('lifecycle === "generating" || lifecycle === "cancelling"');
        expect(assetGenerationPanelSource).toContain('role="status"');
        expect(assetGenerationPanelSource).toContain('aria-live="polite"');
        expect(assetGenerationPanelSource).toContain("Generating image…");
        expect(assetGenerationPanelSource).toContain("h-[240px] w-[240px]");
        expect(assetGenerationPanelSource).toContain("animate-pulse");
    });

    it("provides a compact map-object generation layout without changing the default panel", () => {
        expect(assetGenerationPanelSource).toContain("compact = false");
        expect(assetGenerationPanelSource).toContain('? "Use image"');
        expect(assetGenerationPanelSource).toContain(
            'compact ? "mt-3 flex items-center justify-between gap-2" : "mt-3 flex flex-wrap gap-2"',
        );
        expect(assetGenerationPanelSource).toContain("&& !compact");

        expect(entityUploadSource).toContain('title={selectedAsset ? "Modify with AI" : "Generate with AI"}');
        expect(entityUploadSource).toContain("compact");
        expect(entityUploadSource).not.toContain("Saved AI assets");
        expect(entityUploadSource).not.toContain('aria-label="Saved generated assets"');
        expect(entityUploadSource).not.toContain("uploadEntity.title()");
        expect(entityUploadSource).not.toContain("uploadEntity.description()");

        expect(entityEditorPickerSource).toContain('class="px-3 pb-3"');
        expect(entityEditorPickerSource).not.toContain(
            'class="min-h-full rounded-2xl border border-white/10 bg-black/10 p-3"',
        );
    });

    it("archives a completed map-object generation before the user places it", () => {
        expect(assetGenerationPanelSource).toContain("onGenerated?:");
        expect(assetGenerationPanelSource).toContain(
            "await onGenerated?.({ blob: normalized, ...candidateProvenance });",
        );
        expect(entityUploadSource).toContain("onGenerated={persistGeneratedAsset}");
    });

    it("offers one simple optional animation strip for map assets", () => {
        expect(assetGenerationPanelSource).toContain("Animate this asset");
        expect(assetGenerationPanelSource).toContain("frameCount");
        expect(assetGenerationPanelSource).toContain("frameDurationMs");
        expect(assetGenerationPanelSource).toContain("one horizontal sprite strip");
        expect(entityUploadSource).toContain(
            "acceptAsset(asset.blob, asset.title ?? `generated-${uuidv4()}.png`, asset.animation);",
        );
    });

    it("supports a guided native-resolution terrain surface without changing the shared flow", () => {
        expect(assetGenerationPanelSource).toContain('generationTarget === "terrain-surface"');
        expect(assetGenerationPanelSource).toContain("generationRules?: string;");
        expect(assetGenerationPanelSource).toContain("presetReferences?: readonly AssetGenerationReference[];");
        expect(assetGenerationPanelSource).toContain(
            "references: [...presetReferences, ...references.forGeneration()]",
        );
        expect(assetGenerationPanelSource).toContain("!stagedWoka && allowAnimation");
        expect(assetGenerationPanelSource).toContain(": acceptLabel");
    });

    it("classifies Description and every uploaded or dropped image before generation", () => {
        expect(assetGenerationPanelSource).toContain(
            'let descriptionRole: AssetGenerationDescriptionRole = $state("object")',
        );
        expect(assetGenerationPanelSource).toContain(
            'let batchReferenceRole: AssetGenerationReferenceRole = $state("object-reference")',
        );
        expect(assetGenerationPanelSource).toContain('value="style-mood"');
        expect(assetGenerationPanelSource).toContain('value="style-mood-guide"');
        expect(assetGenerationPanelSource).toContain("ondrop={dropReferences}");
        expect(assetGenerationPanelSource).toContain("references.setRole(id, role)");
        expect(assetGenerationPanelSource).toContain("unclassifiedReferenceCount > 0");
        expect(assetGenerationPanelSource).toContain("candidateGuidanceSummary");
        expect(assetGenerationPanelSource).not.toContain("&& !compact}\n            <fieldset");
    });

    it("returns image editing to the up-to-date Custom asset list", () => {
        expect(entityUploadSource).toContain('selectCategoryStore.set({ kind: "special", tag: "custom" });');
        expect(entityUploadSource).toContain("onClose?.();");
        expect(entityEditorPickerSource).toContain("function showCustomAssets()");
        expect(entityEditorPickerSource).toContain("onClose={showCustomAssets}");
    });

    it("keeps editing available while hiding variant controls with nothing to choose", () => {
        expect(entityEditorPickerSource).toContain("let hasColorOptions = $derived.by(");
        expect(entityEditorPickerSource).toContain("let hasPositionOptions = $derived.by(");
        expect(entityEditorPickerSource).toContain("pickedEntityVariant.colors.length > 1");
        expect(entityEditorPickerSource).toContain(
            "pickedEntityVariant.getEntityPrefabsPositions(selectedColor).length > 1",
        );
        expect(entityEditorPickerSource).toContain("{#if pickedEntityVariant && pickedEntity}");
        expect(entityEditorPickerSource).toContain("{#if hasColorOptions}");
        expect(entityEditorPickerSource).toContain("{#if hasPositionOptions}");
    });

    it("keeps category options flat beneath search", () => {
        expect(entityEditorPickerSource).toContain(
            '<p class="m-0 truncate text-lg">{getCategoryLabel($selectCategoryStore)}</p>',
        );
        expect(entityEditorPickerSource).not.toContain("{filteredEntityPrefabVariants.length} options");
        expect(entityEditorPickerSource).not.toContain(
            '<section class="shrink-0 rounded-xl border border-white/10 bg-black/10 p-3">',
        );
    });

    it("keeps the asset save action in the selected-object sidebar header", () => {
        expect(entityPropertiesEditorSource).toContain('activeTab === "edit"');
        expect(entityPropertiesEditorSource).toContain("Save asset");
        expect(entityPropertiesEditorSource).toContain("showHeader={false}");
        expect(entityPropertiesEditorSource).toContain("onSaveReady={(save) => (saveAsset = save)}");
        expect(entityPropertiesEditorSource).toContain("onSaveStatusChange={(status) => (assetSaveStatus = status)}");
        expect(customEntityEditionFormSource).toContain("showHeader?: boolean;");
        expect(customEntityEditionFormSource).toContain("{#if showHeader}");
        expect(customEntityEditionFormSource).toContain('saveStatus === "saving"');
        expect(customEntityEditionFormSource).toContain('"Saving..."');
        expect(customEntityEditionFormSource).toContain('"Saved"');
        expect(customEntityEditionFormSource).toContain('variant={saveStatus === "saved" ? "success" : "secondary"}');
        expect(entityPropertiesEditorSource).toContain('"Saving..."');
        expect(entityPropertiesEditorSource).toContain(
            'variant={assetSaveStatus === "saved" ? "success" : "secondary"}',
        );
    });

    it("adapts the compact uploader controls to an image and prompt", () => {
        expect(entityUploadSource).toContain('title={selectedAsset ? "Modify with AI" : "Generate with AI"}');
        expect(entityUploadSource).toContain("src={selectedAsset.previewUrl}");
        expect(entityUploadSource).toContain("onUseImage={selectedAsset ? startEditingSelectedAsset : undefined}");
        expect(assetGenerationPanelSource).toContain("onUseImage?: () => void;");
        expect(assetGenerationPanelSource).toContain('prompt.trim() === "" && onUseImage !== undefined');
        expect(assetGenerationPanelSource).toContain('? "Use image"');
        expect(assetGenerationPanelSource).toContain('{#if compact && prompt.trim() !== ""}');
        expect(assetGenerationPanelSource).toContain('compact ? "text-base font-semibold"');
    });
});
