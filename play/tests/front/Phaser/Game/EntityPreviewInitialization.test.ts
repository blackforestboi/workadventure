import { describe, expect, it } from "vitest";

import entityEditorToolSource from "../../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts?raw";
import entityRelatedEditorToolSource from "../../../../src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts?raw";

describe("entity placement preview initialization", () => {
    it("positions and layers a loaded preview before the first pointer movement", () => {
        expect(entityRelatedEditorToolSource).toMatch(
            /preview\.setDisplaySize\([\s\S]*?this\.onEntityPrefabPreviewReady\(pointer\);/,
        );
        expect(entityEditorToolSource).toMatch(
            /onEntityPrefabPreviewReady\(pointer: Pointer\): void \{\s*this\.updateEntityPrefabPreviewPosition\(pointer\);\s*this\.changePreviewTint\(\);\s*\}/,
        );
    });
});
