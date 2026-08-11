import type { TeapotTerrainMutation } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";

import { ModifyTerrainFrontCommand } from "../../../../../src/front/Phaser/Game/MapEditor/Commands/Terrain/ModifyTerrainFrontCommand";
import type { FloorEditorTool } from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool";

describe("ModifyTerrainFrontCommand", () => {
    const forward: TeapotTerrainMutation = {
        mapId: "map.wam",
        regions: [{ layer: "floor", x: -9, y: -5, width: 2, height: 2, gids: [1, 1, 1, 1] }],
    };
    const backward: TeapotTerrainMutation = {
        mapId: "map.wam",
        regions: [{ layer: "floor", x: -9, y: -5, width: 2, height: 2, gids: [0, 0, 0, 0] }],
    };

    it("does not apply an optimistically previewed signed edit twice, but still applies redo and undo", async () => {
        const applyTerrainMutation = vi.fn();
        const floorEditor = {
            applyTerrainMutation,
            canApplyTerrainMutation: vi.fn(() => true),
            revertOptimisticTerrainMutation: vi.fn(),
        } as unknown as FloorEditorTool;
        const command = ModifyTerrainFrontCommand.fromOptimisticPreview(floorEditor, forward, backward);

        await command.execute();
        expect(applyTerrainMutation).not.toHaveBeenCalled();

        await command.getUndoCommand().execute();
        expect(applyTerrainMutation).toHaveBeenLastCalledWith(backward);

        await command.execute();
        expect(applyTerrainMutation.mock.calls).toEqual([[backward], [forward]]);
    });

    it("still applies commands that were not previewed", async () => {
        const applyTerrainMutation = vi.fn();
        const floorEditor = {
            applyTerrainMutation,
            canApplyTerrainMutation: vi.fn(() => true),
            revertOptimisticTerrainMutation: vi.fn(),
        } as unknown as FloorEditorTool;

        await new ModifyTerrainFrontCommand(floorEditor, forward, backward).execute();

        expect(applyTerrainMutation).toHaveBeenCalledOnce();
        expect(applyTerrainMutation).toHaveBeenCalledWith(forward);
    });

    it("rolls back an optimistic deletion if an avatar occupies the tile before the command is sent", async () => {
        const applyTerrainMutation = vi.fn();
        const revertOptimisticTerrainMutation = vi.fn();
        const floorEditor = {
            applyTerrainMutation,
            canApplyTerrainMutation: vi.fn(() => false),
            revertOptimisticTerrainMutation,
        } as unknown as FloorEditorTool;
        const command = ModifyTerrainFrontCommand.fromOptimisticPreview(floorEditor, backward, forward);

        await expect(command.execute()).rejects.toThrow("A tile beneath an avatar cannot be deleted.");

        expect(applyTerrainMutation).not.toHaveBeenCalled();
        expect(revertOptimisticTerrainMutation).toHaveBeenCalledOnce();
        expect(revertOptimisticTerrainMutation).toHaveBeenCalledWith(forward);
    });

    it("rejects a non-previewed occupied deletion without changing the map", async () => {
        const applyTerrainMutation = vi.fn();
        const floorEditor = {
            applyTerrainMutation,
            canApplyTerrainMutation: vi.fn(() => false),
            revertOptimisticTerrainMutation: vi.fn(),
        } as unknown as FloorEditorTool;

        await expect(new ModifyTerrainFrontCommand(floorEditor, backward, forward).execute()).rejects.toThrow(
            "A tile beneath an avatar cannot be deleted.",
        );

        expect(applyTerrainMutation).not.toHaveBeenCalled();
    });
});
