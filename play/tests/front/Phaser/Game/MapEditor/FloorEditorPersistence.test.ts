import { describe, expect, it, vi } from "vitest";

import { FloorEditorTool } from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool";

describe("FloorEditorTool persistence recovery", () => {
    it("restores the last acknowledged map when map storage rejects an optimistic terrain edit", () => {
        const lastAcknowledgedMap = { revision: "saved" };
        const rejectedDraft = { revision: "unsaved-hole" };
        const scene = { mapFile: { revision: "previous" } };
        const setState = vi.fn();
        const tool = Object.assign(Object.create(FloorEditorTool.prototype), {
            publishedMap: { revision: "previous" },
            draftBaseMap: lastAcknowledgedMap,
            draftMap: rejectedDraft,
            scene,
            previewRegions: [{}],
            changedTileKeys: new Set(["floor:0:0"]),
            pendingTilesetSelection: { firstGid: 1 },
            saving: true,
            setState,
        }) as FloorEditorTool;

        tool.rejectTerrainMutation("Map storage could not save the edit");

        expect((tool as unknown as { publishedMap: unknown }).publishedMap).toEqual(lastAcknowledgedMap);
        expect(scene.mapFile).toEqual(lastAcknowledgedMap);
        expect((tool as unknown as { draftMap: unknown }).draftMap).toBeUndefined();
        expect(setState).toHaveBeenCalledWith({
            status: "failed",
            changedTiles: 0,
            error: "Map storage could not save the edit",
        });
    });
});
