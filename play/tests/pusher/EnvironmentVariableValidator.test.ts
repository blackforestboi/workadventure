import { describe, expect, it } from "vitest";
import { EnvironmentVariables } from "../../src/pusher/enums/EnvironmentVariableValidator";

const pwaEnvironment = EnvironmentVariables.pick({ BYPASS_PWA: true });
const startRoomEnvironment = EnvironmentVariables.pick({ START_ROOM_URL: true });
const brandingEnvironment = EnvironmentVariables.pick({
    BRAND_NAME: true,
    BRAND_SHORT_NAME: true,
    BRAND_DESCRIPTION: true,
    BRAND_AUTHOR: true,
    BRAND_PROVIDER: true,
    BRAND_THEME_COLOR: true,
    BRAND_LOADING_LOGO_URL: true,
    BRAND_LOADING_BACKGROUND_URL: true,
});

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

describe("branding environment variables", () => {
    it("provides tpot.world defaults", () => {
        expect(brandingEnvironment.parse({})).toMatchObject({
            BRAND_NAME: "tpot.world",
            BRAND_SHORT_NAME: "tpot",
            BRAND_DESCRIPTION: "Organize your online world in tpot.world.",
            BRAND_AUTHOR: "tpot.world team",
            BRAND_PROVIDER: "tpot.world",
            BRAND_THEME_COLOR: "#1B2A41",
        });
    });

    it("accepts deployment-specific names and asset URLs", () => {
        expect(
            brandingEnvironment.parse({
                BRAND_NAME: "Example Map",
                BRAND_LOADING_LOGO_URL: "https://assets.example.test/loading.gif",
                BRAND_LOADING_BACKGROUND_URL: "/branding/background.webp",
            }),
        ).toMatchObject({
            BRAND_NAME: "Example Map",
            BRAND_LOADING_LOGO_URL: "https://assets.example.test/loading.gif",
            BRAND_LOADING_BACKGROUND_URL: "/branding/background.webp",
        });
    });
});
