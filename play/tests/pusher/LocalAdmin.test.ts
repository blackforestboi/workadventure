// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => import("./mocks/pusherEnvironmentVariableMock"));

import { localAdmin } from "../../src/pusher/services/LocalAdmin";

describe("LocalAdmin", () => {
    describe("fetchMapDetails", () => {
        it("redirects a generated world root to its canonical WAM file", async () => {
            const result = await localAdmin.fetchMapDetails(
                "http://play.workadventure.localhost/~/worlds/ee7f5768-0c0f-4329-b7a0-908657853b31",
            );

            expect(result).toEqual({
                redirectUrl:
                    "http://play.workadventure.localhost/~/worlds/ee7f5768-0c0f-4329-b7a0-908657853b31/maps/world.wam",
            });
        });
    });
});
