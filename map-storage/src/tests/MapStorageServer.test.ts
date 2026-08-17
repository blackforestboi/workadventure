import type { ServerUnaryCall } from "@grpc/grpc-js";
import type { EditMapCommandMessage, EditMapCommandWithKeyMessage } from "@workadventure/messages";
import type { Empty } from "@workadventure/messages/src/ts-proto-generated/google/protobuf/empty";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mapsManagerMock = vi.hoisted(() => ({
    waitForLock: vi.fn((_mapKey: string, callback: () => Promise<void>) => callback()),
    loadWAMToMemory: vi.fn(),
    executeCommand: vi.fn().mockResolvedValue(undefined),
    addCommandToQueue: vi.fn(),
}));

vi.mock("../MapsManager", () => ({ mapsManager: mapsManagerMock }));

import { mapStorageServer } from "../MapStorageServer";

describe("MapStorageServer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mapsManagerMock.loadWAMToMemory.mockResolvedValue({
            getWam: () => ({ version: "1.0.0", mapUrl: "world.tmj", areas: [], entities: {} }),
            getGameMapAreas: () => undefined,
        });
    });

    it("reloads the durable WAM before applying every edit", async () => {
        const command: EditMapCommandMessage = {
            id: "command-1",
            editMapMessage: {
                message: {
                    $case: "errorCommandMessage",
                    errorCommandMessage: { reason: "test command" },
                },
            },
        };
        const call = {
            request: {
                mapKey: "https://maps.example.test/world.wam",
                editMapCommandMessage: command,
                connectedUserTags: [],
                userCanEdit: true,
                userUUID: "editor",
            },
        } as unknown as ServerUnaryCall<EditMapCommandWithKeyMessage, Empty>;

        await new Promise<void>((resolve, reject) => {
            mapStorageServer.handleEditMapCommandWithKeyMessage(call, (error, response) => {
                if (error) {
                    reject(new Error("Map storage unexpectedly rejected the test edit"));
                    return;
                }
                expect(response).toEqual(command);
                resolve();
            });
        });

        expect(mapsManagerMock.loadWAMToMemory).toHaveBeenCalledWith("world.wam");
    });
});
