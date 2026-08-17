import { describe, expect, it } from "vitest";

import { resolveMapEditorFloorSaveStatus } from "../../../src/front/Stores/MapEditorFloorStore";

describe("resolveMapEditorFloorSaveStatus", () => {
    it("only reports saved after acknowledgement and after every submitted map command has settled", () => {
        expect(resolveMapEditorFloorSaveStatus("idle", 0)).toBe("idle");
        expect(resolveMapEditorFloorSaveStatus("saved", 1)).toBe("saving");
        expect(resolveMapEditorFloorSaveStatus("saved", 0)).toBe("saved");
        expect(resolveMapEditorFloorSaveStatus("failed", 0)).toBe("failed");
    });
});
