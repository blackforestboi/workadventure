import { CustomEntityDirection, type UploadEntityMessage } from "@workadventure/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";

const gameSceneMock = vi.hoisted(() => ({
    getCustomEntityCollectionUrl: vi.fn(() => "https://maps.example.test/assets/entities/entities.json"),
}));

vi.mock("../../../../../src/front/Phaser/Game/GameManager", () => ({
    gameManager: {
        getCurrentGameScene: () => gameSceneMock,
    },
}));

import { UploadEntityFrontCommand } from "../../../../../src/front/Phaser/Game/MapEditor/Commands/Entity/UploadEntityFrontCommand";

const uploadEntityMessage: UploadEntityMessage = {
    id: "fa8a803e-555d-460c-b94f-6607c52408b5",
    file: new Uint8Array([1, 2, 3]),
    direction: CustomEntityDirection.Down,
    name: "Small Plant",
    tags: ["natural"],
    imagePath: "fa8a803e-555d-460c-b94f-6607c52408b5-Small-Plant.png",
    color: "green",
    collisionGrid: [[0], [1]],
};

describe("UploadEntityFrontCommand", () => {
    const addUploadedEntity = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("publishes a local upload only after map storage acknowledges the durable file", async () => {
        const command = new UploadEntityFrontCommand(
            uploadEntityMessage,
            undefined as never,
            { addUploadedEntity } as never,
            "command-id",
        );

        await command.execute();
        expect(addUploadedEntity).not.toHaveBeenCalled();

        command.onAcknowledged();
        expect(addUploadedEntity).toHaveBeenCalledOnce();
        expect(addUploadedEntity).toHaveBeenCalledWith(
            expect.objectContaining({
                id: uploadEntityMessage.id,
                collisionGrid: [[0], [1]],
            }),
            "https://maps.example.test/assets/entities/entities.json",
        );
    });

    it("publishes a remote upload immediately because its storage write already completed", async () => {
        const command = new UploadEntityFrontCommand(
            uploadEntityMessage,
            undefined as never,
            { addUploadedEntity } as never,
            "command-id",
            true,
        );

        await command.execute();

        expect(addUploadedEntity).toHaveBeenCalledOnce();
    });
});
