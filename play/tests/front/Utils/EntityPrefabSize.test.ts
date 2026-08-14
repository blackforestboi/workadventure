import { describe, expect, it } from "vitest";

import {
    getEntityDisplaySize,
    getOpaqueBoundsFromAlphaBuffer,
    getVegetationDisplaySize,
    shouldPlaceEntity,
} from "../../../src/front/Utils/EntityPrefabSize";
import texturesHelperSource from "../../../src/front/Phaser/Helpers/TexturesHelper.ts?raw";
import entityRelatedEditorToolSource from "../../../src/front/Phaser/Game/MapEditor/Tools/EntityRelatedEditorTool.ts?raw";
import modifyCustomEntityCommandSource from "../../../src/front/Phaser/Game/MapEditor/Commands/Entity/ModifyCustomEntityFrontCommand.ts?raw";
import entitiesManagerSource from "../../../src/front/Phaser/Game/GameMap/EntitiesManager.ts?raw";
import entitySource from "../../../src/front/Phaser/ECS/Entity.ts?raw";
import entityEditorToolSource from "../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts?raw";

describe("entity prefab default size", () => {
    it("finds the opaque rectangle in one RGBA buffer", () => {
        const pixels = new Uint8ClampedArray(5 * 4 * 4);
        for (const [x, y, alpha] of [
            [1, 1, 1],
            [3, 1, 255],
            [2, 2, 128],
        ]) {
            pixels[(y * 5 + x) * 4 + 3] = alpha;
        }

        expect(getOpaqueBoundsFromAlphaBuffer(pixels, 5, 4)).toEqual({ width: 3, height: 2 });
    });

    it("returns no opaque bounds for transparent, incomplete, or invalid buffers", () => {
        expect(getOpaqueBoundsFromAlphaBuffer(new Uint8ClampedArray(3 * 2 * 4), 3, 2)).toBeUndefined();
        expect(getOpaqueBoundsFromAlphaBuffer(new Uint8ClampedArray(3), 3, 2)).toBeUndefined();
        expect(getOpaqueBoundsFromAlphaBuffer(new Uint8ClampedArray(4), 0, 1)).toBeUndefined();
    });

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

    it.each([
        ["small", 43, 32],
        ["medium", 62, 48],
        ["large", 74, 64],
    ])("scales a representative %s tree to its visible-size target", (_tier, visibleSize, targetSize) => {
        const displaySize = getVegetationDisplaySize(128, 128, "tree", visibleSize, visibleSize);
        const scale = targetSize / visibleSize;

        expect(displaySize).toEqual({ width: 128 * scale, height: 128 * scale });
    });

    it.each([
        [48, 32],
        [49, 48],
        [64, 48],
        [65, 64],
    ])("uses the documented tier at the %spx visible boundary", (visibleSize, targetSize) => {
        const displaySize = getVegetationDisplaySize(100, 100, "tree", visibleSize, visibleSize);

        expect(displaySize).toBeDefined();
        expect((displaySize!.width * visibleSize) / 100).toBeCloseTo(targetSize);
        expect((displaySize!.height * visibleSize) / 100).toBeCloseTo(targetSize);
    });

    it("scales the full tree canvas uniformly from non-square visible bounds", () => {
        expect(getVegetationDisplaySize(128, 256, "tree", 40, 60)).toEqual({ width: 102.4, height: 204.8 });
    });

    it.each([
        [undefined, undefined],
        [40, undefined],
        [0, 40],
        [40, 0],
        [-1, 40],
        [Number.NaN, 40],
        [Number.POSITIVE_INFINITY, 40],
    ])("falls back to two-tile tree height for invalid visible bounds", (visibleWidth, visibleHeight) => {
        expect(getVegetationDisplaySize(128, 256, "tree", visibleWidth, visibleHeight)).toEqual({
            width: 32,
            height: 64,
        });
    });

    it("does not apply tree sizing to non-tree vegetation", () => {
        expect(getVegetationDisplaySize(128, 256, "bush", 43, 43)).toBeUndefined();
    });

    it.each([0, Number.NaN, Number.POSITIVE_INFINITY])(
        "does not produce invalid dimensions for an invalid natural tree width",
        (naturalWidth) => {
            expect(getVegetationDisplaySize(naturalWidth, 256, "tree", 43, 43)).toBeUndefined();
        },
    );

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

    it("reads and caches a selected tree frame before deriving its preview size", () => {
        expect(texturesHelperSource).toContain("new WeakMap<Phaser.Textures.Frame, VisibleBounds | null>()");
        expect(texturesHelperSource.match(/context\.drawImage\(/g)).toHaveLength(1);
        expect(texturesHelperSource.match(/context\.getImageData\(/g)).toHaveLength(1);
        expect(texturesHelperSource).toContain("getOpaqueBoundsFromAlphaBuffer(");
        expect(texturesHelperSource).toContain("this.visibleBoundsByFrame.set(frame, null)");

        const visibleBoundsIndex = entityRelatedEditorToolSource.indexOf(
            "TexturesHelper.getVisibleBounds(preview.frame)",
        );
        const treeSizeIndex = entityRelatedEditorToolSource.indexOf("getVegetationDisplaySize(");
        const genericSizeIndex = entityRelatedEditorToolSource.indexOf("getEntityDisplaySize(");
        expect(visibleBoundsIndex).toBeGreaterThan(-1);
        expect(treeSizeIndex).toBeGreaterThan(visibleBoundsIndex);
        expect(genericSizeIndex).toBeGreaterThan(treeSizeIndex);
        expect(entityRelatedEditorToolSource).toContain("visibleBounds?.width");
        expect(entityRelatedEditorToolSource).toContain("visibleBounds?.height");
        expect(entityRelatedEditorToolSource).toContain('entityPrefab.vegetation?.category === "tree"');
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
