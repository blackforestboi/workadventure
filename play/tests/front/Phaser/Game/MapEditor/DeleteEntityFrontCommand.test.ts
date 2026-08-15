import type { WamFile, WAMEntityData } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";

import type { RoomConnection } from "../../../../../src/front/Connection/RoomConnection";
import type { EntitiesManager } from "../../../../../src/front/Phaser/Game/GameMap/EntitiesManager";
import { CreateEntityFrontCommand } from "../../../../../src/front/Phaser/Game/MapEditor/Commands/Entity/CreateEntityFrontCommand";
import { DeleteEntityFrontCommand } from "../../../../../src/front/Phaser/Game/MapEditor/Commands/Entity/DeleteEntityFrontCommand";

describe("DeleteEntityFrontCommand", () => {
    it("creates a usable inverse command after deleting an entity", async () => {
        const entityData: WAMEntityData = {
            x: 32,
            y: 64,
            width: 32,
            height: 16,
            prefabRef: { collectionName: "walls", id: "brick-wall" },
            properties: [],
            wall: { version: 1, orientation: "horizontal" },
        };
        const gameMapEntities = {
            getEntity: vi.fn(() => entityData),
            deleteEntity: vi.fn(() => true),
        };
        const wamFile = { getGameMapEntities: () => gameMapEntities } as unknown as WamFile;
        const entitiesManager = { deleteEntity: vi.fn(), getEntities: () => new Map() } as unknown as EntitiesManager;
        const command = new DeleteEntityFrontCommand(wamFile, "wall-1", undefined, entitiesManager);

        await command.execute();
        const inverse = command.getUndoCommand();

        expect(inverse).toBeInstanceOf(CreateEntityFrontCommand);
        const emitMapEditorCreateEntity = vi.fn();
        inverse.emitEvent({ emitMapEditorCreateEntity } as unknown as RoomConnection);
        expect(emitMapEditorCreateEntity).toHaveBeenCalledWith(
            inverse.commandId,
            "wall-1",
            expect.objectContaining({ wall: entityData.wall }),
            { width: 32, height: 16 },
        );
    });
});
