// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => import("./mocks/pusherEnvironmentVariableMock"));

import { localAdmin } from "../../src/pusher/services/LocalAdmin";

describe("LocalAdmin", () => {
    describe("fetchMapDetails", () => {
        it.each(["/play", "/play/"])("redirects the configured landing path %s to the main room", async (path) => {
            const result = await localAdmin.fetchMapDetails(`http://front.test${path}`);

            expect(result).toEqual({
                redirectUrl: "http://front.test/play/~/maps/empty.wam",
            });
        });

        it("resolves a prefixed room URL through map storage", async () => {
            const result = await localAdmin.fetchMapDetails("http://front.test/play/~/maps/empty.wam");

            expect(result).toEqual(expect.objectContaining({ wamUrl: "http://map-storage.test/maps/empty.wam" }));
        });

        it("redirects a generated world root to its canonical WAM file", async () => {
            const result = await localAdmin.fetchMapDetails(
                "http://play.workadventure.localhost/~/worlds/ee7f5768-0c0f-4329-b7a0-908657853b31",
            );

            expect(result).toEqual({
                redirectUrl:
                    "http://play.workadventure.localhost/~/worlds/ee7f5768-0c0f-4329-b7a0-908657853b31/maps/world.wam",
            });
        });

        it("constructs the legacy root redirect from an absolute start-room URL", async () => {
            const result = await localAdmin.fetchMapDetails("http://front.test/");

            expect(result).toEqual({
                redirectUrl: "http://front.test/play/~/maps/empty.wam",
            });
        });
    });
});
