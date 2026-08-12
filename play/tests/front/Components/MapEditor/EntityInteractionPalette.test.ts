import { describe, expect, it } from "vitest";

import entityPropertiesEditorSource from "../../../../src/front/Components/MapEditor/EntityEditor/EntityPropertiesEditor.svelte?raw";
import addPropertyButtonWrapperSource from "../../../../src/front/Components/MapEditor/PropertyEditor/AddPropertyButtonWrapper.svelte?raw";
import exitPropertyEditorSource from "../../../../src/front/Components/MapEditor/PropertyEditor/ExitPropertyEditor.svelte?raw";
import entitySource from "../../../../src/front/Phaser/ECS/Entity.ts?raw";
import exitPasswordModalSource from "../../../../src/front/Components/Modal/ExitPasswordModal.svelte?raw";

describe("entity interaction palette", () => {
    it("offers only the requested area interaction types", () => {
        for (const property of [
            "livekitRoomProperty",
            "exit",
            "jitsiRoomProperty",
            "playAudio",
            "tooltipPropertyData",
            "speakerMegaphone",
        ]) {
            expect(entityPropertiesEditorSource).toContain(`property="${property}"`);
        }

        for (const property of [
            "personalAreaPropertyData",
            "restrictedRightsPropertyData",
            "silent",
            "listenerMegaphone",
            "start",
            "matrixRoomPropertyData",
            "focusable",
            "highlight",
            "lockableAreaPropertyData",
            "maxUsersInAreaPropertyData",
        ]) {
            expect(entityPropertiesEditorSource).not.toContain(`property="${property}"`);
        }
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

    it("supports password-protected object exits", () => {
        expect(exitPropertyEditorSource).toContain('id="exitPassword"');
        expect(exitPropertyEditorSource).toContain('type="password"');
        expect(entitySource).toContain('case "exit"');
        expect(entitySource).toContain("modals.open(ExitPasswordModal");
        expect(exitPasswordModalSource).toContain("Incorrect password");
    });

    it("accepts external exit URLs while suggesting known room destinations", () => {
        expect(exitPropertyEditorSource).toContain('placeholder="https://example.com/~/maps/room.wam"');
        expect(exitPropertyEditorSource).toContain('list="exit-map-options"');
        expect(exitPropertyEditorSource).toContain('<datalist id="exit-map-options">');
    });
});
