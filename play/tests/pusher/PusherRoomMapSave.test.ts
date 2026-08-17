import { EventEmitter } from "events";
import type { BatchToPusherRoomMessage } from "@workadventure/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";

const acknowledgeSuccess = vi.hoisted(() => vi.fn());
const acknowledgeFailure = vi.hoisted(() => vi.fn());
const listenRoom = vi.hoisted(() => vi.fn());

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => import("./mocks/pusherEnvironmentVariableMock"));
vi.mock("../../src/pusher/services/ApiClientRepository", () => ({
    apiClientRepository: { getClient: vi.fn().mockResolvedValue({ listenRoom }) },
}));
vi.mock("../../src/pusher/services/SocketManager", () => ({
    socketManager: { cleanupSocket: vi.fn() },
}));
vi.mock("../../src/pusher/teapot/TeapotWamRevisionCoordinator", () => ({
    teapotWamRevisionCoordinator: {
        acknowledgeSuccess,
        acknowledgeFailure,
        releaseRoom: vi.fn().mockResolvedValue(undefined),
    },
}));
vi.mock("../../src/pusher/models/PositionDispatcher", () => ({
    PositionDispatcher: class {
        public isEmpty() {
            return false;
        }
    },
}));

import { PusherRoom } from "../../src/pusher/models/PusherRoom";
import type { PusherWebSocket } from "../../src/pusher/services/PusherWebSocket";
import type { ZoneEventListener } from "../../src/pusher/models/Zone";

class FakeBackConnection extends EventEmitter {
    public readonly write = vi.fn();
    public readonly cancel = vi.fn();
}

describe("PusherRoom map save finalization", () => {
    let backConnection: FakeBackConnection;
    let emitInBatch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        backConnection = new FakeBackConnection();
        listenRoom.mockReturnValue(backConnection);
        emitInBatch = vi.fn();
    });

    it("acknowledges a remotely persisted map even when revision bookkeeping fails afterward", async () => {
        acknowledgeSuccess.mockRejectedValueOnce(new Error("revision database unavailable"));
        const room = new PusherRoom("https://play.test/world.wam", {} as unknown as ZoneEventListener);
        await room.init();
        room.join({
            emitInBatch,
            getUserData: () => ({ tags: [], pusherRoom: undefined }),
        } as unknown as PusherWebSocket);

        backConnection.emit("data", {
            payload: [
                {
                    message: {
                        $case: "editMapCommandMessage",
                        editMapCommandMessage: {
                            id: "command-1",
                            editMapMessage: {
                                message: {
                                    $case: "deleteEntityMessage",
                                    deleteEntityMessage: { id: "tree" },
                                },
                            },
                        },
                    },
                },
            ],
        } satisfies BatchToPusherRoomMessage);

        await vi.waitFor(() => expect(emitInBatch).toHaveBeenCalledOnce());

        expect(emitInBatch).toHaveBeenCalledWith({
            message: {
                $case: "editMapCommandMessage",
                editMapCommandMessage: {
                    id: "command-1",
                    editMapMessage: {
                        message: {
                            $case: "deleteEntityMessage",
                            deleteEntityMessage: { id: "tree" },
                        },
                    },
                },
            },
        });
    });
});
