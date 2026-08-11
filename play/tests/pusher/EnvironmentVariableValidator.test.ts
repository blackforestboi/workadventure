import { describe, expect, it } from "vitest";
import { EnvironmentVariables } from "../../src/pusher/enums/EnvironmentVariableValidator";

const pwaEnvironment = EnvironmentVariables.pick({ BYPASS_PWA: true });

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
