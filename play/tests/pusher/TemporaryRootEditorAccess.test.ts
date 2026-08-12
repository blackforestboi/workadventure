// @vitest-environment node

import { describe, expect, it } from "vitest";

import { hasTemporaryRootGuestAccess } from "../../src/pusher/teapot/TemporaryRootEditorAccess";

describe("hasTemporaryRootGuestAccess", () => {
    const rootRoom = "/~/maps/areas.wam";

    it("preserves anonymous editing only for the configured root room", () => {
        expect(
            hasTemporaryRootGuestAccess({
                roomId: "https://tpot.world/~/maps/areas.wam?catalog=latest",
                startRoomUrl: rootRoom,
                mapEditorAllowAllUsers: true,
                isAnonymous: true,
            }),
        ).toBe(true);
        expect(
            hasTemporaryRootGuestAccess({
                roomId: "https://tpot.world/~/worlds/other/maps/world.wam",
                startRoomUrl: rootRoom,
                mapEditorAllowAllUsers: true,
                isAnonymous: true,
            }),
        ).toBe(false);
    });

    it("does not bypass X authentication for logged-in users or when the flag is off", () => {
        expect(
            hasTemporaryRootGuestAccess({
                roomId: "https://tpot.world/~/maps/areas.wam",
                startRoomUrl: rootRoom,
                mapEditorAllowAllUsers: true,
                isAnonymous: false,
            }),
        ).toBe(false);
        expect(
            hasTemporaryRootGuestAccess({
                roomId: "https://tpot.world/~/maps/areas.wam",
                startRoomUrl: rootRoom,
                mapEditorAllowAllUsers: false,
                isAnonymous: true,
            }),
        ).toBe(false);
    });
});
