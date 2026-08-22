import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadInstanceConfig,
  projectComposeEnvironment,
  serializeComposeEnvironment,
  validateInstanceConfig,
} from "./instance-config.mjs";

const examplePath = fileURLToPath(
  new URL("./instance.config.example.json", import.meta.url),
);

test("the example validates and projects a custom domain and same-origin service URLs", async () => {
  const config = await loadInstanceConfig(examplePath);
  const environment = projectComposeEnvironment(config, {
    instanceConfigFile: examplePath,
  });

  assert.equal(environment.DOMAIN, "world.example.com");
  assert.equal(environment.PUBLIC_ORIGIN, "https://world.example.com");
  assert.equal(environment.PLAY_URL, "https://world.example.com");
  assert.equal(environment.PUSHER_URL, "https://world.example.com");
  assert.equal(
    environment.PUBLIC_MAP_STORAGE_URL,
    "https://world.example.com/map-storage",
  );
  assert.equal(
    environment.TEAPOT_MCP_PUBLIC_URL,
    "https://world.example.com/mcp",
  );
  assert.equal(
    environment.TEAPOT_X_REDIRECT_URI,
    "https://world.example.com/teapot/auth/x/callback",
  );
  assert.equal(
    environment.TEAPOT_MCP_ALLOWED_HOSTS,
    "world.example.com,localhost:17374,127.0.0.1:17374",
  );
  assert.equal(
    environment.ENTITY_COLLECTION_URLS,
    "https://world.example.com/collections/FurnitureCollection.json,https://world.example.com/collections/OfficeCollection.json",
  );
  assert.equal(environment.BRAND_NAME, "My World");
  assert.equal(environment.BRAND_CONTACT_EMAIL, "hello@example.com");
  assert.equal(
    environment.BRAND_FAVICON_URL,
    "https://world.example.com/branding/favicon.svg",
  );
  assert.equal(
    environment.BRAND_LOADING_LOGO_URL,
    "https://world.example.com/branding/loading-logo.svg",
  );
  assert.equal(
    environment.BRAND_LOGO_URL,
    "https://world.example.com/branding/logo.svg",
  );
  assert.equal(
    environment.SERVER_ICON,
    "https://world.example.com/branding/server-icon.png",
  );
  assert.equal(
    environment.START_ROOM_URL,
    "https://world.example.com/~/maps/start.wam",
  );
  assert.equal(environment.INSTANCE_CONFIG_FILE, examplePath);
});

test("frontend base paths preserve root compatibility and only move frontend URLs", async () => {
  const parsedExample = JSON.parse(await readFile(examplePath, "utf8"));
  const omittedBasePath = { ...parsedExample };
  delete omittedBasePath.frontendBasePath;

  assert.equal(validateInstanceConfig(omittedBasePath).frontendBasePath, "");
  assert.equal(
    validateInstanceConfig({ ...parsedExample, frontendBasePath: "/" })
      .frontendBasePath,
    "",
  );

  const environment = projectComposeEnvironment({
    ...parsedExample,
    frontendBasePath: "/play",
    startRoomUrl: "/~/maps/empty.wam",
  });

  assert.equal(environment.FRONT_URL, "https://world.example.com/play");
  assert.equal(environment.PLAY_URL, "https://world.example.com");
  assert.equal(environment.PUSHER_URL, "https://world.example.com");
  assert.equal(
    environment.PUBLIC_MAP_STORAGE_URL,
    "https://world.example.com/map-storage",
  );
  assert.equal(environment.UPLOADER_URL, "https://world.example.com/uploader");
  assert.equal(environment.ICON_URL, "https://world.example.com/icon");
  assert.equal(
    environment.START_ROOM_URL,
    "https://world.example.com/play/~/maps/empty.wam",
  );
});

test("same-origin start rooms receive the frontend base path exactly once", async () => {
  const parsedExample = JSON.parse(await readFile(examplePath, "utf8"));
  const alreadyPrefixed = projectComposeEnvironment({
    ...parsedExample,
    frontendBasePath: "/play",
    startRoomUrl: "/play/~/maps/empty.wam",
  });
  const external = projectComposeEnvironment({
    ...parsedExample,
    frontendBasePath: "/play",
    startRoomUrl: "https://rooms.example.net/~/maps/empty.wam",
  });
  const similarlyPrefixed = projectComposeEnvironment({
    ...parsedExample,
    frontendBasePath: "/play",
    startRoomUrl: "/playground/~/maps/empty.wam",
  });

  assert.equal(
    alreadyPrefixed.START_ROOM_URL,
    "https://world.example.com/play/~/maps/empty.wam",
  );
  assert.equal(
    external.START_ROOM_URL,
    "https://rooms.example.net/~/maps/empty.wam",
  );
  assert.equal(
    similarlyPrefixed.START_ROOM_URL,
    "https://world.example.com/play/playground/~/maps/empty.wam",
  );
});

test("malformed frontend base paths fail validation", async () => {
  const parsedExample = JSON.parse(await readFile(examplePath, "utf8"));
  const invalidBasePaths = [
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
  ];

  for (const frontendBasePath of invalidBasePaths) {
    assert.throws(
      () => validateInstanceConfig({ ...parsedExample, frontendBasePath }),
      /frontendBasePath/,
    );
  }
});

test("invalid public origins and missing required identity fields fail validation", () => {
  const minimumConfig = {
    version: 1,
    publicOrigin: "https://community.example.net",
    branding: {
      name: "Community",
      shortName: "Community",
      description: "A community world.",
      author: "Community team",
      provider: "Community",
      themeColor: "#123456",
      assets: {},
    },
  };

  assert.throws(
    () =>
      validateInstanceConfig({
        ...minimumConfig,
        publicOrigin: "ftp://community.example.net",
      }),
    /publicOrigin must be an absolute HTTP or HTTPS URL/,
  );
  assert.throws(
    () =>
      validateInstanceConfig({
        ...minimumConfig,
        publicOrigin: "https://community.example.net/game",
      }),
    /publicOrigin must contain only the scheme, hostname, and optional port/,
  );
  assert.throws(
    () =>
      validateInstanceConfig({
        ...minimumConfig,
        branding: { ...minimumConfig.branding, provider: undefined },
      }),
    /branding.provider must be a non-empty string/,
  );
});

test("secret-valued fields are rejected and never appear in the Compose projection", async () => {
  const parsedExample = JSON.parse(await readFile(examplePath, "utf8"));
  assert.throws(
    () =>
      validateInstanceConfig({
        ...parsedExample,
        databaseUrl: "postgresql://user:password@example/db",
      }),
    /keep secrets in the deployment environment/,
  );

  const output = serializeComposeEnvironment(
    projectComposeEnvironment(parsedExample, {
      instanceConfigFile: examplePath,
    }),
  );
  assert.doesNotMatch(
    output,
    /(?:PASSWORD|SECRET|TOKEN|CREDENTIAL|DATABASE_URL|CLIENT_SECRET|API_KEY)=/i,
  );
  assert.doesNotMatch(output, /\$\{[^}]+\}/);
});
