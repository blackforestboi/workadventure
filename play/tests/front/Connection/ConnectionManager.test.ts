import { describe, expect, it } from "vitest";

import { connectionManager } from "../../../src/front/Connection/ConnectionManager";

describe("ConnectionManager", () => {
    it("cancels a pending Pusher probe when the owning scene closes", async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(connectionManager.waitForPusherPing(controller.signal)).rejects.toMatchObject({
            code: "ERR_CANCELED",
        });
    });
});
