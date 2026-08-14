import { describe, expect, it } from "vitest";

import vegetationEditorSource from "../../../../../src/front/Components/MapEditor/VegetationEditor/VegetationEditor.svelte?raw";
import mapEditorModeManagerSource from "../../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager.ts?raw";
import entityEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts?raw";
import floorEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts?raw";

describe("vegetation editor interactions", () => {
    it("equips the entity placement tool without leaving the vegetation browser", () => {
        const placeFunction = vegetationEditorSource.slice(
            vegetationEditorSource.indexOf("function place("),
            vegetationEditorSource.indexOf("function toggleSpecies("),
        );

        expect(placeFunction).toContain("equipTool(EditorToolName.EntityEditor, EditorToolName.FloorEditor)");
        expect(
            placeFunction.indexOf("equipTool(EditorToolName.EntityEditor, EditorToolName.FloorEditor)"),
        ).toBeLessThan(placeFunction.indexOf("mapEditorSelectedEntityPrefabStore.set"));
    });

    it("preserves the visible terrain panel state while arming entity placement", () => {
        const equipToolFunction = mapEditorModeManagerSource.slice(
            mapEditorModeManagerSource.indexOf("public equipTool("),
            mapEditorModeManagerSource.indexOf("public returnToLastMode("),
        );
        const floorClearFunction = floorEditorToolSource.slice(
            floorEditorToolSource.indexOf("public clear("),
            floorEditorToolSource.indexOf("public activate("),
        );

        expect(equipToolFunction).toContain("this.clearToNeutralState(visibleTool === this.activeTool)");
        expect(floorClearFunction).toContain("if (!preserveInterfaceState)");
        expect(floorClearFunction).toMatch(
            /if \(!preserveInterfaceState\) \{\s*mapEditorFloorStateStore\.set\(undefined\);\s*\}/u,
        );
    });

    it("keeps individual vegetation placement armed after creating an entity", () => {
        const pointerDownFunction = entityEditorToolSource.slice(
            entityEditorToolSource.indexOf("protected handlePointerDownEvent("),
            entityEditorToolSource.indexOf("protected unbindEventHandlers("),
        );
        const keepPlacementBranch = pointerDownFunction.slice(
            pointerDownFunction.indexOf("if (keepPlacementActive)"),
            pointerDownFunction.indexOf('mapEditorEntityModeStore.set("EDIT")'),
        );

        expect(pointerDownFunction).toContain("const keepPlacementActive = this.entityPrefab.vegetation !== undefined");
        expect(keepPlacementBranch).toContain("return");
        expect(keepPlacementBranch).not.toContain("mapEditorSelectedEntityPrefabStore.set(undefined)");
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

    it("places an area immediately with finite prefab dimensions and no confirmation step", () => {
        const finishSelectionFunction = floorEditorToolSource.slice(
            floorEditorToolSource.indexOf("private finishVegetationSelection("),
            floorEditorToolSource.indexOf("private renderVegetationGhosts("),
        );

        expect(finishSelectionFunction).toContain("displayWidthInTiles");
        expect(finishSelectionFunction).toContain("displayHeightInTiles");
        expect(finishSelectionFunction).toContain("new CreateVegetationBatchFrontCommand(");
        expect(finishSelectionFunction).toContain("executeCommand(");
        expect(vegetationEditorSource).not.toContain("confirmPreview");
        expect(vegetationEditorSource).not.toContain(">Confirm</button");
        expect(vegetationEditorSource).not.toContain(">Resample</button");
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

    it("keeps low-resolution pixel-art vegetation crisp when thumbnails are enlarged", () => {
        expect(vegetationEditorSource).toContain("[image-rendering:pixelated]");
    });
});
