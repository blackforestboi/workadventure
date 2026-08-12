import { describe, expect, it } from "vitest";

import entitiesGridSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntitiesGrid.svelte?raw";
import entityItemSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityItem/EntityItem.svelte?raw";
import entityRelatedEditorToolSource from "../../../../src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts?raw";

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
});
