import { describe, expect, it } from "vitest";

import entityPropertiesEditorSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityPropertiesEditor.svelte?raw";

describe("entity properties editor", () => {
    it("puts the back action above a compact editing title", () => {
        const backAction = entityPropertiesEditorSource.indexOf("backToSelectObject()");
        const editingTitle = entityPropertiesEditorSource.indexOf("mapEditor.entityEditor.editing");

        expect(backAction).toBeGreaterThan(-1);
        expect(editingTitle).toBeGreaterThan(backAction);
        expect(entityPropertiesEditorSource).toContain('class="my-2 text-xl font-medium"');
        expect(entityPropertiesEditorSource).not.toContain("Drag the object to move it.");
    });

    it("keeps object actions and image editing in separate tabs", () => {
        expect(entityPropertiesEditorSource).toContain('let activeTab = $state<"actions" | "edit">("actions")');
        expect(entityPropertiesEditorSource).toContain('selectedAssetPrefab?.type === "Custom"');
        expect(entityPropertiesEditorSource).toContain("Actions");
        expect(entityPropertiesEditorSource).toContain("Edit");
        expect(entityPropertiesEditorSource).toContain("<CustomEntityEditionForm");
        expect(entityPropertiesEditorSource).toContain("applyEntityModifications={saveCustomAsset}");
    });

    it("hydrates the asset editor from the live catalog instead of the placed entity cache", () => {
        expect(entityPropertiesEditorSource).toContain("getEntitiesPrefabsStore()");
        expect(entityPropertiesEditorSource).toContain("entityPrefabs.find(");
        expect(entityPropertiesEditorSource).toContain("customEntity={selectedAssetPrefab}");
        expect(entityPropertiesEditorSource).not.toContain("customEntity={selectedEntity.getPrefab()}");
    });
});
