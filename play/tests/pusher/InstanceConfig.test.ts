import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    InstanceConfigSchema,
    loadInstanceConfigEnvironment,
    projectInstanceConfigToEnvironment,
} from "../../src/pusher/config/InstanceConfig";

const exampleConfig = InstanceConfigSchema.parse({
    version: 1,
    publicOrigin: "https://world.example.test/",
    frontendBasePath: "/play",
    branding: {
        name: "Example World",
        shortName: "Example",
        description: "A small universe.",
        author: "Example Community",
        provider: "Example Host",
        themeColor: "#123abc",
        contactEmail: "support@example.test",
        assets: {
            favicon: "/branding/favicon.svg",
            loadingLogo: "/branding/loading-logo.svg",
            logo: "/branding/logo.svg",
            manifestIcon: "https://cdn.example.test/icon.svg",
        },
    },
    links: {
        issuesUrl: "/support/issues",
    },
    server: {
        motd: "Welcome home",
    },
    startRoomUrl: "/~/maps/home.wam",
});

describe("instance configuration", () => {
    it("projects an unrelated brand and derives same-origin service URLs", () => {
        expect(projectInstanceConfigToEnvironment(exampleConfig)).toMatchObject({
            PUSHER_URL: "https://world.example.test",
            FRONT_URL: "https://world.example.test/play",
            ALLOWED_CORS_ORIGIN: "https://world.example.test",
            PUBLIC_MAP_STORAGE_URL: "https://world.example.test/map-storage",
            TEAPOT_MCP_PUBLIC_URL: "https://world.example.test/mcp",
            TEAPOT_X_REDIRECT_URI: "https://world.example.test/teapot/auth/x/callback",
            BRAND_NAME: "Example World",
            BRAND_WEBSITE_URL: "https://world.example.test",
            BRAND_CONTACT_EMAIL: "support@example.test",
            BRAND_FAVICON_URL: "https://world.example.test/branding/favicon.svg",
            BRAND_LOADING_LOGO_URL: "https://world.example.test/branding/loading-logo.svg",
            BRAND_LOGO_URL: "https://world.example.test/branding/logo.svg",
            BRAND_MANIFEST_ICON_URL: "https://cdn.example.test/icon.svg",
            CONTACT_URL: "mailto:support@example.test",
            REPORT_ISSUES_URL: "https://world.example.test/support/issues",
            SERVER_NAME: "Example World Server",
            SERVER_MOTD: "Welcome home",
            START_ROOM_URL: "https://world.example.test/play/~/maps/home.wam",
        });
    });

    it("normalizes root-compatible base paths and keeps root-path projection compatible", () => {
        const withoutBasePath = InstanceConfigSchema.parse({
            ...exampleConfig,
            frontendBasePath: undefined,
        });
        const slashBasePath = InstanceConfigSchema.parse({
            ...exampleConfig,
            frontendBasePath: "/",
        });

        expect(withoutBasePath.frontendBasePath).toBe("");
        expect(slashBasePath.frontendBasePath).toBe("");
        expect(projectInstanceConfigToEnvironment(withoutBasePath)).toMatchObject({
            FRONT_URL: "https://world.example.test",
            START_ROOM_URL: "https://world.example.test/~/maps/home.wam",
        });
    });

    it.each([
        "play",
        "//other.example/play",
        "/play/",
        "/play//room",
        "/play?room=home",
        "/play#home",
        "/play/../admin",
        "/play/%2e%2e/admin",
        "/play/%2Fadmin",
        "//user:password@other.example/play",
        " /play",
    ])("rejects malformed frontend base path %s", (frontendBasePath) => {
        expect(() =>
            InstanceConfigSchema.parse({
                ...exampleConfig,
                frontendBasePath,
            }),
        ).toThrow();
    });

    it("prefixes same-origin start rooms exactly once and leaves external rooms unchanged", () => {
        const alreadyPrefixed = InstanceConfigSchema.parse({
            ...exampleConfig,
            startRoomUrl: "/play/~/maps/home.wam",
        });
        const external = InstanceConfigSchema.parse({
            ...exampleConfig,
            startRoomUrl: "https://rooms.example.test/~/maps/home.wam",
        });
        const similarlyPrefixed = InstanceConfigSchema.parse({
            ...exampleConfig,
            startRoomUrl: "/playground/~/maps/home.wam",
        });

        expect(projectInstanceConfigToEnvironment(alreadyPrefixed).START_ROOM_URL).toBe(
            "https://world.example.test/play/~/maps/home.wam",
        );
        expect(projectInstanceConfigToEnvironment(external).START_ROOM_URL).toBe(
            "https://rooms.example.test/~/maps/home.wam",
        );
        expect(projectInstanceConfigToEnvironment(similarlyPrefixed).START_ROOM_URL).toBe(
            "https://world.example.test/play/playground/~/maps/home.wam",
        );
    });

    it("lets explicit environment variables override file values", () => {
        const directory = mkdtempSync(join(tmpdir(), "instance-config-"));
        const configPath = join(directory, "instance.json");
        writeFileSync(configPath, JSON.stringify(exampleConfig));

        const environment = loadInstanceConfigEnvironment({
            INSTANCE_CONFIG_PATH: configPath,
            BRAND_NAME: "Environment World",
            PUSHER_URL: "https://override.example.test",
        });

        expect(environment.BRAND_NAME).toBe("Environment World");
        expect(environment.PUSHER_URL).toBe("https://override.example.test");
        expect(environment.BRAND_CONTACT_EMAIL).toBe("support@example.test");
    });

    it("preserves the legacy environment-only path when no file is configured", () => {
        const environment = { BRAND_NAME: "Legacy World" };
        expect(loadInstanceConfigEnvironment(environment)).toBe(environment);
    });

    it("fails clearly when the configured file cannot be read", () => {
        expect(() =>
            loadInstanceConfigEnvironment({ INSTANCE_CONFIG_PATH: "/definitely/missing/instance-config.json" }),
        ).toThrow("Unable to read instance configuration");
    });

    it("fails clearly when the configured file is invalid", () => {
        const directory = mkdtempSync(join(tmpdir(), "instance-config-"));
        const configPath = join(directory, "instance.json");
        writeFileSync(configPath, JSON.stringify({ version: 1, publicOrigin: "not a URL" }));

        expect(() => loadInstanceConfigEnvironment({ INSTANCE_CONFIG_PATH: configPath })).toThrow(
            "Invalid instance configuration",
        );
    });
});
