import { describe, expect, it } from "vitest";

import mapEditorModeManagerSource from "../../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager.ts?raw";

describe("map editor save failures", () => {
    it("shows every server-side command rejection in the global error UI", () => {
        const rejectionHandler = mapEditorModeManagerSource.slice(
            mapEditorModeManagerSource.indexOf("public subscribeToRoomConnection("),
            mapEditorModeManagerSource.indexOf("private emitMapEditorUpdate("),
        );
        const errorReporter = mapEditorModeManagerSource.slice(
            mapEditorModeManagerSource.indexOf("private reportMapSaveFailure("),
            mapEditorModeManagerSource.indexOf("private async revertPendingCommands("),
        );

        expect(rejectionHandler).toContain("this.reportMapSaveFailure(errorCommandMessage.reason)");
        expect(errorReporter).toContain("errorStore.addErrorMessage(");
    });

    it("shows command failures that happen before the save is submitted", () => {
        const commandExecution = mapEditorModeManagerSource.slice(
            mapEditorModeManagerSource.indexOf("public async executeCommand("),
            mapEditorModeManagerSource.indexOf("public async executeLocalCommand("),
        );

        expect(commandExecution).toContain("this.reportMapSaveFailure(");
        expect(commandExecution).toContain('"The map change could not be submitted."');
    });
});
