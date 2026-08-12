import { describe, expect, it } from "vitest";

import {
    createEmptyCollisionGrid,
    resizeCollisionGrid,
} from "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CollisionGridResizer";
import customEntityEditionFormSource from "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.svelte?raw";
import collisionGridSource from "../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/EntityEditionCollisionGrid.svelte?raw";
import entityEditorTabsSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityEditorTabs.svelte?raw";

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

    it("keeps the image editor focused on its workspace and detail tabs", () => {
        expect(customEntityEditionFormSource).toContain(
            '<h2 class="m-0 min-w-0 truncate text-lg font-semibold">{name}</h2>',
        );
        expect(customEntityEditionFormSource).toContain("Metadata");
        expect(customEntityEditionFormSource).toContain("Positioning");
        expect(customEntityEditionFormSource).toContain("Style");
        expect(customEntityEditionFormSource).toContain('spacingClass="mt-4"');
        expect(customEntityEditionFormSource).toContain("Clear collision areas");
        expect(customEntityEditionFormSource).toMatch(
            /\{#if hasCollisionAreas\}[\s\S]*?Clear collision areas[\s\S]*?\{\/if\}[\s\S]*?<label for="previewPadding">Padding<\/label>/,
        );
        expect(customEntityEditionFormSource).toMatch(/appearance="border"\s*\{disabled\}/);
        expect(customEntityEditionFormSource).not.toContain("disabled={disabled || !hasCollisionAreas}");
        expect(customEntityEditionFormSource).toContain('min="-64"');
        expect(customEntityEditionFormSource).toContain("style:clip-path");
        expect(customEntityEditionFormSource).toContain("oninput={updateCollisionGridWidth}");
        expect(customEntityEditionFormSource).toContain("oninput={updateCollisionGridHeight}");
        expect(customEntityEditionFormSource).toContain("ENTITY_SIZE_TILE_OPTIONS");
        expect(customEntityEditionFormSource).toContain("defaultSizeInTiles * MAP_TILE_SIZE");
        expect(customEntityEditionFormSource).toContain("collisionGrid.map((row) => row.length)) * MAP_TILE_SIZE");
        expect(customEntityEditionFormSource).toContain("getOpaqueImageBounds(");
        expect(customEntityEditionFormSource).toContain("getDefaultHeightInTiles(bounds.width, bounds.height)");
        expect(customEntityEditionFormSource).not.toContain("collisionFrameOffset");
        expect(customEntityEditionFormSource).toContain("oninput={updatePreviewPadding}");
        expect(customEntityEditionFormSource).toContain("initialPreviewPadding ?? 24");
        expect(customEntityEditionFormSource).toContain("onpointerdown={startPreviewDrag}");
        expect(customEntityEditionFormSource).toContain("onpointermove={movePreview}");
        expect(customEntityEditionFormSource).toContain("previewOffsetX");
        expect(customEntityEditionFormSource).toContain("previewOffsetY");
        expect(customEntityEditionFormSource).toContain("data-collision-grid");
        expect(customEntityEditionFormSource).toContain("previewPadding,");
        expect(customEntityEditionFormSource).toContain("100 tiles");
        expect(customEntityEditionFormSource).not.toContain('<select\n                        id="collisionCellSize"');
        expect(customEntityEditionFormSource).not.toContain("Add collision areas");
        expect(customEntityEditionFormSource).not.toContain("Remove collision areas");
    });

    it("keeps collision cells square for every grid width and height", () => {
        expect(collisionGridSource).toContain(
            "Math.min(collisionGridWidth / columnCount, collisionGridHeight / rowCount)",
        );
        expect(collisionGridSource).toContain("displayedGridWidth");
        expect(collisionGridSource).toContain("displayedGridHeight");
        expect(collisionGridSource).toContain("(collisionGridWidth - displayedGridWidth) / 2");
        expect(collisionGridSource).toContain("(collisionGridHeight - displayedGridHeight) / 2");
    });

    it("uses a clear white underline for the active editor tab", () => {
        expect(entityEditorTabsSource).toContain("border-white");
        expect(entityEditorTabsSource).toContain("spacingClass");
    });
});
