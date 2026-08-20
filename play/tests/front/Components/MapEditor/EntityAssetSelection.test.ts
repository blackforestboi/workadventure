import { describe, expect, it } from "vitest";

import entitiesGridSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntitiesGrid.svelte?raw";
import entityItemSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityItem/EntityItem.svelte?raw";
import entityRelatedEditorToolSource from "../../../../src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts?raw";
import pickerSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityEditorPicker.svelte?raw";
import metadataSource from "../../../../src/front/Components/MapEditor/EntityEditor/ObjectStylePackMetadata.ts?raw";

describe("entity asset selection", () => {
    it("outlines the asset card for any armed prefab in its variant", () => {
        expect(entitiesGridSource).toContain('entityPrefabVariant.prefabIds.includes(currentSelectedEntityId ?? "")');
        expect(entityItemSource).toContain(
            'isActive ? "ring-2 ring-blue-400 ring-offset-2 ring-offset-[#24344d]" : ""',
        );
    });

    it("removes the outlined state when Escape clears the armed prefab", () => {
        expect(entityRelatedEditorToolSource).toMatch(
            /protected cleanPreview\(\): void \{[\s\S]*mapEditorSelectedEntityPrefabStore\.set\(undefined\);/,
        );
    });

    it("separates Built-in, Default and custom object views while retaining existing search and categories", () => {
        expect(pickerSource).toContain("resolveVariantsForActiveStyle");
        expect(pickerSource).toContain('variant.defaultPrefab.type !== "Custom"');
        expect(pickerSource).toContain('variant.defaultPrefab.type === "Custom"');
        expect(pickerSource).toContain("getEntitiesPrefabsVariantsFilteredByTag(styleFilteredEntityPrefabVariants");
    });

    it("snapshots every prefab variant rather than reconstructing an object from raster bytes", () => {
        expect(metadataSource).toContain("entityVariant.colors.flatMap");
        expect(metadataSource).toContain("getEntityPrefabsPositions");
        expect(metadataSource).toContain("snapshot: { prefabs }");
        expect(metadataSource).toContain("prefab.tags");
        expect(metadataSource).toContain("prefab.collectionName");
    });
});
