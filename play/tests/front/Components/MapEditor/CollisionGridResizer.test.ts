import { describe, expect, it } from "vitest";

import {
    createEmptyCollisionGrid,
    resizeCollisionGrid,
} from "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CollisionGridResizer";
import customEntityEditionFormSource from "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.svelte?raw";

describe("collision grid resizer", () => {
    it("creates an empty grid with safe minimum dimensions", () => {
        expect(createEmptyCollisionGrid(2, 3)).toEqual([
            [0, 0, 0],
            [0, 0, 0],
        ]);
        expect(createEmptyCollisionGrid(0, 0)).toEqual([[0]]);
    });

    it("preserves painted regions when changing grid resolution", () => {
        expect(
            resizeCollisionGrid(
                [
                    [1, 0],
                    [0, 0],
                ],
                1,
                1,
            ),
        ).toEqual([[1]]);
        expect(resizeCollisionGrid([[1]], 2, 2)).toEqual([
            [1, 1],
            [1, 1],
        ]);
    });

    it("keeps the image editor focused on its workspace and two detail columns", () => {
        expect(customEntityEditionFormSource).toContain("Edit image");
        expect(customEntityEditionFormSource).toContain("Metadata");
        expect(customEntityEditionFormSource).toContain("Positioning");
        expect(customEntityEditionFormSource).toContain("Clear collision areas");
        expect(customEntityEditionFormSource).toContain('min="-64"');
        expect(customEntityEditionFormSource).toContain("style:clip-path");
        expect(customEntityEditionFormSource).toContain("oninput={updateCollisionCellSize}");
        expect(customEntityEditionFormSource).toContain("ENTITY_SIZE_TILE_OPTIONS");
        expect(customEntityEditionFormSource).toContain("defaultSizeInTiles * MAP_TILE_SIZE");
        expect(customEntityEditionFormSource).toContain("collisionGridWidth + previewPadding * 2");
        expect(customEntityEditionFormSource).toContain("collisionFrameHeight / collisionFrameWidth");
        expect(customEntityEditionFormSource).toContain("offsetX={collisionFrameOffset}");
        expect(customEntityEditionFormSource).toContain("oninput={updatePreviewPadding}");
        expect(customEntityEditionFormSource).toContain("100 tiles");
        expect(customEntityEditionFormSource).not.toContain('<select\n                        id="collisionCellSize"');
        expect(customEntityEditionFormSource).not.toContain("Add collision areas");
        expect(customEntityEditionFormSource).not.toContain("Remove collision areas");
    });
});
