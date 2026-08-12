import { describe, expect, it } from "vitest";

import entityPropertiesEditorSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityPropertiesEditor.svelte?raw";
import addPropertyButtonWrapperSource from "../../../../src/front/Components/MapEditor/PropertyEditor/AddPropertyButtonWrapper.svelte?raw";

describe("entity interaction palette", () => {
    it("offers the area interaction types that are supported by entities", () => {
        for (const property of [
            "personalAreaPropertyData",
            "restrictedRightsPropertyData",
            "silent",
            "livekitRoomProperty",
            "speakerMegaphone",
            "listenerMegaphone",
            "start",
            "exit",
            "jitsiRoomProperty",
            "playAudio",
            "matrixRoomPropertyData",
            "focusable",
            "highlight",
            "tooltipPropertyData",
            "lockableAreaPropertyData",
            "maxUsersInAreaPropertyData",
        ]) {
            expect(entityPropertiesEditorSource).toContain(`property="${property}"`);
        }
        expect(entityPropertiesEditorSource).toContain('subProperty="cards"');
        expect(entityPropertiesEditorSource).toContain('subProperty="tldraw"');
    });

    it("wraps the complete area interaction palette to the available editor width", () => {
        expect(entityPropertiesEditorSource).toContain("properties-buttons flex flex-row flex-wrap m-2");
    });

    it("does not disable URL integrations through unrelated global tool flags", () => {
        for (const flag of [
            "klaxoonToolActivated",
            "youtubeToolActivated",
            "googleDriveToolActivated",
            "googleDocsToolActivated",
            "googleSheetsToolActivated",
            "googleSlidesToolActivated",
            "eraserToolActivated",
            "excalidrawToolActivated",
            "cardsToolActivated",
            "tldrawToolActivated",
        ]) {
            expect(addPropertyButtonWrapperSource).not.toContain(flag);
        }
    });
});
