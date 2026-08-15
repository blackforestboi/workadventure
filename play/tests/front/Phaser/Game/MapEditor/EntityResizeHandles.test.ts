import { describe, expect, it } from "vitest";
import entityResizeHandlesSource from "../../../../../src/front/Phaser/Game/MapEditor/Entities/EntityResizeHandles.ts?raw";
import entityRelatedEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts?raw";
import entitySource from "../../../../../src/front/Phaser/ECS/Entity.ts?raw";
import entityEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts?raw";

describe("EntityResizeHandles", () => {
    it("renders resize controls above foreground terrain overlays", () => {
        expect(entityResizeHandlesSource).toContain('import { DEPTH_OVERLAY_INDEX } from "../../DepthIndexes";');
        expect(entityResizeHandlesSource).toContain("const RESIZE_CONTROLS_DEPTH = DEPTH_OVERLAY_INDEX + 100;");
        expect(entityResizeHandlesSource).toContain("const depth = RESIZE_CONTROLS_DEPTH;");
        expect(entityResizeHandlesSource).toContain("this.outline.setDepth(depth);");
        expect(entityResizeHandlesSource).toContain(
            'this.positionHandle("north-west", bounds.x, bounds.y, depth + 1);',
        );
        expect(entityResizeHandlesSource).not.toContain("const depth = this.entity.depth + 10;");
    });

    it("creates draggable handles for every selected editable prefab", () => {
        expect(entityRelatedEditorToolSource).toMatch(
            /mapEditorSelectedEntityStore\.subscribe\(\(entity\) => \{[\s\S]*if \(entity\.canEdit\) \{[\s\S]*new EntityResizeHandles\(this\.scene, entity\)/,
        );
        expect(entityResizeHandlesSource).toContain(".setInteractive({ cursor })");
        expect(entityResizeHandlesSource).toContain("this.scene.input.setDraggable(handle);");
    });

    it("commits the resized bounds through the generic entity update chain", () => {
        expect(entityResizeHandlesSource).toContain("this.entity.commitEditorBounds(this.currentBounds)");
        expect(entitySource).toContain("this.entityData.width = authoredBounds.width;");
        expect(entitySource).toContain("this.entityData.height = authoredBounds.height;");
        expect(entitySource).toContain("this.emit(EntityEvent.Updated, this.appendId(authoredBounds));");
        expect(entityEditorToolSource).toContain("new UpdateEntityFrontCommand(");
    });

    it("places resize handles around the rendered sprite instead of its collision frame", () => {
        expect(entityResizeHandlesSource).toContain("const bounds = this.getBounds();");
        expect(entityResizeHandlesSource).not.toContain("const bounds = this.getOutlineBounds();");
        expect(entityResizeHandlesSource).toContain("return this.entity.getEditorBounds();");
        expect(entityResizeHandlesSource).toContain("const tileWidth = bounds.width / columns;");
        expect(entityResizeHandlesSource).toContain("const tileHeight = bounds.height / collisionGrid.length;");
        expect(entityResizeHandlesSource).not.toContain("const collisionFrame =");
    });
});
