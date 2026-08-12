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

    it("keeps login gating and exposes a creation loading state", () => {
        expect(mapEditorMenuItemSource).toContain('new CustomEvent("workadventure:open-login-overlay")');
        expect(mapEditorMenuItemSource).toContain("if (!$mapEditorActivated && !requireLogin()) return;");
        expect(mapEditorMenuItemSource).toContain("oncreatenew: localUserStore.isLogged() ? createNewWorld : undefined");
        expect(mapEditorWorldPickerSource).toContain("disabled={creatingWorld}");
        expect(mapEditorWorldPickerSource).toContain("{#if oncreatenew !== undefined}");
        expect(mapEditorWorldPickerSource).toContain("$LL.actionbar.mapEditorCreating()");
        expect(mapEditorMenuItemSource).toContain("warningMessageStore.addWarningMessage");
    });
});
