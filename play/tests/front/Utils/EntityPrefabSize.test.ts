import { describe, expect, it } from "vitest";

import {
    getEntityDisplaySize,
    getVegetationDisplaySize,
    shouldPlaceEntity,
} from "../../../src/front/Utils/EntityPrefabSize";
import entityRelatedEditorToolSource from "../../../src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts?raw";
import modifyCustomEntityCommandSource from "../../../src/front/Phaser/Game/MapEditor/Commands/Entity/ModifyCustomEntityFrontCommand.ts?raw";
import entitiesManagerSource from "../../../src/front/Phaser/Game/GameMap/EntitiesManager.ts?raw";
import entitySource from "../../../src/front/Phaser/ECS/Entity.ts?raw";
import entityEditorToolSource from "../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts?raw";

describe("entity prefab default size", () => {
    it("does not render an original-size shadow for selected entities", () => {
        expect(entityRelatedEditorToolSource).not.toContain("entityOldPositionPreview");
        expect(entityRelatedEditorToolSource).not.toContain(".setAlpha(0.5)");
    });

    it.each([
        [0.5, 16],
        [1, 32],
        [3, 96],
        [100, 3200],
    ])("maps %s tiles to %spx while preserving aspect ratio", (tiles, width) => {
        expect(getEntityDisplaySize(512, 256, tiles)).toEqual({ width, height: width / 2 });
    });

    it("keeps the raster's natural dimensions when grid width and height are stored", () => {
        expect(getEntityDisplaySize(512, 256, 1, 3)).toEqual({ width: 512, height: 256 });
    });

    it("renders trees at their authored height while preserving aspect ratio", () => {
        expect(getVegetationDisplaySize(128, 256, "tree")).toEqual({ width: 32, height: 64 });
        expect(getVegetationDisplaySize(128, 256, "bush")).toBeUndefined();
    });

    it("allows an explicitly clicked tree even while its blocking preview overlaps the editor avatar", () => {
        expect(shouldPlaceEntity(false, "tree")).toBe(true);
        expect(shouldPlaceEntity(false, "bush")).toBe(false);
        expect(shouldPlaceEntity(true, undefined)).toBe(true);
        expect(entityEditorToolSource).toContain("shouldPlaceEntity(this.canEntityBePlaced()");
        expect(entityEditorToolSource).toContain("0xffa500 : 0xff0000");
    });

    it("keeps legacy natural dimensions when no default is stored", () => {
        expect(getEntityDisplaySize(512, 256, undefined)).toEqual({ width: 512, height: 256 });
    });

    it("preserves natural preview dimensions when a collision grid has width and height", () => {
        expect(entityRelatedEditorToolSource).toContain("getEntityDisplaySize(");
        expect(entityRelatedEditorToolSource).toContain("entityPrefab.defaultSizeInTiles");
        expect(entityRelatedEditorToolSource).toContain("entityPrefab.defaultHeightInTiles");
        expect(entityRelatedEditorToolSource).toContain("getVegetationDisplaySize(");
        expect(entityRelatedEditorToolSource).toContain(
            "preview.setDisplaySize(displaySize.width, displaySize.height)",
        );
    });

    it("refreshes every placed copy when a custom asset is saved", () => {
        expect(modifyCustomEntityCommandSource).toContain("updateEntitiesPrefabMetadata(id, {");
        expect(modifyCustomEntityCommandSource).toContain("defaultSizeInTiles");
        expect(modifyCustomEntityCommandSource).toContain("defaultHeightInTiles");
        expect(modifyCustomEntityCommandSource).toContain("previewPadding");
        expect(entitiesManagerSource).toContain("entity.updatePrefabMetadata(metadata)");
        expect(entitiesManagerSource).toContain('| "previewPadding"');
        expect(entitySource).toContain('| "previewPadding"');
        expect(entitySource).toContain("this.entityData.width = displaySize.width");
        expect(entitySource).toContain("this.entityData.height = displaySize.height");
    });
});
