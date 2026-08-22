import { describe, expect, it } from "vitest";

import mapEditorMenuItemSource from "../../../../../src/front/Components/ActionBar/MenuIcons/MapEditorMenuItem.svelte?raw";
import mapEditorWorldPickerSource from "../../../../../src/front/Components/PopUp/MapEditorWorldPicker.svelte?raw";

describe("MapEditorMenuItem", () => {
    it("opens the current-world and create-new actions in the global floating layer", () => {
        expect(mapEditorMenuItemSource).toContain("showFloatingUi(");
        expect(mapEditorMenuItemSource).toContain("MapEditorWorldPicker");
        expect(mapEditorMenuItemSource).toContain("bind:wrapperDiv={triggerElement}");
        expect(mapEditorWorldPickerSource).toContain('data-testid="map-editor-options"');
        expect(mapEditorWorldPickerSource).toContain('data-testid="map-editor-this-world"');
        expect(mapEditorWorldPickerSource).toContain('data-testid="map-editor-create-new"');
        expect(mapEditorMenuItemSource).toContain("worldCreationApi.create(gameManager.currentStartedRoom.href)");
        expect(mapEditorMenuItemSource).toContain("window.location.assign(result.roomUrl)");
    });

    it("keeps both world actions visible for guests and gates the selected action", () => {
        expect(mapEditorMenuItemSource).toContain('new CustomEvent("workadventure:open-login-overlay")');
        expect(mapEditorMenuItemSource).toContain("function openThisWorld() {\n        if (!requireLogin()) return;");
        expect(mapEditorMenuItemSource).toContain(
            "async function createNewWorld() {\n        if (!requireLogin()) return;",
        );
        expect(mapEditorMenuItemSource).toContain(
            "function toggleWorldPicker(): void {\n        if (closeFloatingUi !== undefined)",
        );
        expect(mapEditorWorldPickerSource).toContain("disabled={creatingWorld}");
        expect(mapEditorWorldPickerSource).toContain("{#if oncreatenew !== undefined}");
        expect(mapEditorWorldPickerSource).toContain("$LL.actionbar.mapEditorCreating()");
        expect(mapEditorMenuItemSource).toContain("warningMessageStore.addWarningMessage");
    });

    it("uses the shared room-mode policy before showing or opening the editor", () => {
        expect(mapEditorMenuItemSource).toContain("WAMSettingsUtils.canEditMap");
        expect(mapEditorMenuItemSource).toContain("if (!WAMSettingsUtils.canEditMap");
    });
});
