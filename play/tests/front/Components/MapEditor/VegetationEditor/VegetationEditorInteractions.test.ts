import { describe, expect, it } from "vitest";

import vegetationEditorSource from "../../../../../src/front/Components/MapEditor/VegetationEditor/VegetationEditor.svelte?raw";
import floorEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts?raw";

describe("vegetation editor interactions", () => {
    it("equips the entity tool before arming individual placement", () => {
        const placeFunction = vegetationEditorSource.slice(
            vegetationEditorSource.indexOf("function place("),
            vegetationEditorSource.indexOf("function toggleSpecies("),
        );

        expect(placeFunction).toContain("equipTool(EditorToolName.EntityEditor)");
        expect(placeFunction.indexOf("equipTool(EditorToolName.EntityEditor)")).toBeLessThan(
            placeFunction.indexOf("mapEditorSelectedEntityPrefabStore.set"),
        );
    });

    it("starts map rectangle selection as soon as a mix is saved", () => {
        const savePresetFunction = vegetationEditorSource.slice(
            vegetationEditorSource.indexOf("async function savePreset()"),
            vegetationEditorSource.indexOf("function previewArea("),
        );

        expect(savePresetFunction).toContain("equipTool(EditorToolName.FloorEditor)");
        expect(savePresetFunction).toContain("selectionMode: true");
        expect(vegetationEditorSource).not.toContain("Area bounds in tiles");
        expect(vegetationEditorSource).not.toContain("bind:value={areaX}");
    });

    it("handles vegetation selection before the no-brush terrain pan fallback", () => {
        const pointerDownFunction = floorEditorToolSource.slice(
            floorEditorToolSource.indexOf("private handlePointerDown("),
            floorEditorToolSource.indexOf("private handlePointerUp("),
        );

        expect(pointerDownFunction.indexOf("if (this.vegetationSelectionActive)")).toBeLessThan(
            pointerDownFunction.indexOf('if (this.selectedLayer === "")'),
        );
        expect(pointerDownFunction).toContain("this.getVegetationTileAtPointer(pointer)");
    });

    it("renders area previews with the selected vegetation artwork instead of circles", () => {
        const renderFunction = floorEditorToolSource.slice(
            floorEditorToolSource.indexOf("private renderVegetationGhosts("),
            floorEditorToolSource.indexOf("private clearVegetationGhosts("),
        );

        expect(renderFunction).toContain("TexturesHelper.loadEntityTexture");
        expect(renderFunction).toContain("this.scene.add.sprite");
        expect(renderFunction).toContain("placement.prefabRef");
        expect(renderFunction).toContain("setDisplaySize(placement.width, placement.height)");
        expect(renderFunction).toContain("setAlpha(0.7)");
        expect(renderFunction).toContain("vegetationGhostGeneration");
        expect(renderFunction).not.toContain("this.scene.add.circle");
    });

    it("keeps mix controls above a list that fills the remaining panel height", () => {
        expect(vegetationEditorSource).toMatch(/Area mix[\s\S]*Search vegetation/u);
        expect(vegetationEditorSource).toContain('data-testid="vegetation-list"');
        expect(vegetationEditorSource).toContain('class="min-h-0 flex-1 overflow-y-auto"');
        expect(vegetationEditorSource).not.toContain("max-h-48");
    });
});
