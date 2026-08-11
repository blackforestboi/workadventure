import { describe, expect, it } from "vitest";

import entityRelatedEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts?raw";
import floorEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts?raw";
import mapEditorModeManagerSource from "../../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager.ts?raw";

describe("map editor Escape routing", () => {
    it("closes immediately when the active tool has nothing to cancel", () => {
        expect(mapEditorModeManagerSource).toMatch(
            /if \(event\.key === "Escape"\) \{[\s\S]*if \(!this\.currentlyActiveTool\?\.cancelCurrentAction\?\.\(\)\) \{\s*this\.equipTool\(EditorToolName\.CloseMapEditor\);/,
        );
    });

    it("consumes Escape while an entity is selected or awaiting placement", () => {
        expect(entityRelatedEditorToolSource).toMatch(
            /if \(get\(mapEditorEntityModeStore\) === "EDIT"\) \{[\s\S]*mapEditorSelectedEntityStore\.set\(undefined\);[\s\S]*return true;/,
        );
        expect(entityRelatedEditorToolSource).toMatch(
            /if \(this\.entityPrefab === undefined && this\.entityPrefabPreview === undefined\) \{\s*return false;\s*\}[\s\S]*this\.cleanPreview\(\);\s*return true;/,
        );
    });

    it("consumes Escape while a floor brush or shape is active", () => {
        expect(floorEditorToolSource).toMatch(
            /if \(this\.selectedLayer === "" && this\.shapeStart === undefined && !this\.painting\) \{\s*return false;/,
        );
        expect(floorEditorToolSource).toMatch(/this\.clearBrush\(\);\s*return true;/);
    });
});
