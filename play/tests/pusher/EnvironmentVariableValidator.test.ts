import { describe, expect, it } from "vitest";
import { EnvironmentVariables } from "../../src/pusher/enums/EnvironmentVariableValidator";

const pwaEnvironment = EnvironmentVariables.pick({ BYPASS_PWA: true });
const startRoomEnvironment = EnvironmentVariables.pick({ START_ROOM_URL: true });

describe("BYPASS_PWA environment variable", () => {
    it("defaults to continuing in the browser", () => {
        expect(pwaEnvironment.parse({}).BYPASS_PWA).toBe(true);
    });

    it.each([
        ["true", true],
        ["false", false],
    ])("preserves an explicit %s override", (value, expected) => {
        expect(pwaEnvironment.parse({ BYPASS_PWA: value }).BYPASS_PWA).toBe(expected);
    });
});

describe("START_ROOM_URL environment variable", () => {
    it("defaults to the bundled room instead of an external map host", () => {
        expect(startRoomEnvironment.parse({}).START_ROOM_URL).toBe("/~/maps/areas.wam");
    });
});
