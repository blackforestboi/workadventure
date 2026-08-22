#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOP_LEVEL_KEYS = [
  "version",
  "publicOrigin",
  "frontendBasePath",
  "branding",
  "links",
  "server",
  "startRoomUrl",
];
const BRANDING_KEYS = [
  "name",
  "shortName",
  "description",
  "author",
  "provider",
  "themeColor",
  "websiteUrl",
  "contactEmail",
  "assets",
];
const REQUIRED_IDENTITY_KEYS = [
  "name",
  "shortName",
  "description",
  "author",
  "provider",
  "themeColor",
];
const ASSET_KEYS = [
  "logo",
  "loadingLogo",
  "loginLogo",
  "errorLogo",
  "errorImage",
  "loadingBackground",
  "pwaBackground",
  "poweredByLogo",
  "statusIcon",
  "statusCharacter",
  "statusFontImage",
  "statusFontData",
  "favicon",
  "manifestIcon",
  "cardImage",
];
const LINK_KEYS = ["contactUrl", "issuesUrl"];
const SERVER_KEYS = ["name", "motd", "iconUrl"];
const FORBIDDEN_SECRET_KEY =
  /(?:secret|password|token|credential|private.?key|database.?url|client.?secret|api.?key)/i;

const ASSET_ENVIRONMENT_KEYS = {
  logo: "BRAND_LOGO_URL",
  loadingLogo: "BRAND_LOADING_LOGO_URL",
  loginLogo: "BRAND_LOGIN_LOGO_URL",
  errorLogo: "BRAND_ERROR_LOGO_URL",
  errorImage: "BRAND_ERROR_IMAGE_URL",
  loadingBackground: "BRAND_LOADING_BACKGROUND_URL",
  pwaBackground: "BRAND_PWA_BACKGROUND_URL",
  poweredByLogo: "BRAND_POWERED_BY_LOGO_URL",
  statusIcon: "BRAND_STATUS_ICON_URL",
  statusCharacter: "BRAND_STATUS_CHARACTER_URL",
  statusFontImage: "BRAND_STATUS_FONT_IMAGE_URL",
  statusFontData: "BRAND_STATUS_FONT_DATA_URL",
  favicon: "BRAND_FAVICON_URL",
  manifestIcon: "BRAND_MANIFEST_ICON_URL",
  cardImage: "BRAND_CARD_IMAGE_URL",
};

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, path) {
  if (!isPlainObject(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value;
}

function assertNoSecrets(value, path = "instance configuration") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecrets(item, `${path}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_SECRET_KEY.test(key)) {
      throw new Error(
        `${path}.${key} is not allowed; keep secrets in the deployment environment`,
      );
    }
    assertNoSecrets(child, `${path}.${key}`);
  }
}

function assertOnlyKeys(value, allowedKeys, path) {
  const unexpectedKey = Object.keys(value).find(
    (key) => !allowedKeys.includes(key),
  );
  if (unexpectedKey !== undefined) {
    throw new Error(
      `${path}.${unexpectedKey} is not a supported instance configuration field`,
    );
  }
}

function requiredString(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${path} must be a non-empty string`);
  }
  return value.trim();
}

function optionalString(value, path) {
  return value === undefined ? undefined : requiredString(value, path);
}

function parsePublicOrigin(value) {
  const source = requiredString(value, "publicOrigin");
  let url;
  try {
    url = new URL(source);
  } catch (error) {
    throw new Error("publicOrigin must be an absolute HTTP or HTTPS URL", {
      cause: error,
    });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "publicOrigin must be an absolute HTTP or HTTPS URL without credentials",
    );
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(
      "publicOrigin must contain only the scheme, hostname, and optional port",
    );
  }
  return url.origin;
}

function parseFrontendBasePath(value) {
  if (value === undefined || value === "" || value === "/") {
    return "";
  }
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\\")
  ) {
    throw new Error(
      "frontendBasePath must be empty, /, or a canonical leading-slash path without a trailing slash, query, hash, or traversal",
    );
  }

  for (const segment of value.slice(1).split("/")) {
    let decodedSegment;
    try {
      decodedSegment = decodeURIComponent(segment);
    } catch (error) {
      throw new Error("frontendBasePath contains invalid percent encoding", {
        cause: error,
      });
    }
    if (
      decodedSegment === "." ||
      decodedSegment === ".." ||
      decodedSegment.includes("/") ||
      decodedSegment.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(decodedSegment)
    ) {
      throw new Error(
        "frontendBasePath must not contain traversal or encoded path separators",
      );
    }
  }

  return value;
}

function parseAbsoluteUrl(value, path) {
  const source = requiredString(value, path);
  let url;
  try {
    url = new URL(source);
  } catch (error) {
    throw new Error(`${path} must be an absolute HTTP or HTTPS URL`, {
      cause: error,
    });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `${path} must be an absolute HTTP or HTTPS URL without credentials`,
    );
  }
  return url.toString();
}

function parsePublicUrl(value, publicOrigin, path) {
  const source = requiredString(value, path);
  let url;
  try {
    url = new URL(source, `${publicOrigin}/`);
  } catch (error) {
    throw new Error(`${path} must be an HTTP(S) URL or a same-origin path`, {
      cause: error,
    });
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `${path} must be an HTTP(S) URL or a same-origin path without credentials`,
    );
  }
  return source;
}

function parseOptionalPublicUrl(value, publicOrigin, path) {
  return value === undefined
    ? undefined
    : parsePublicUrl(value, publicOrigin, path);
}

function validateEmail(value, path) {
  const email = requiredString(value, path);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${path} must be a valid email address`);
  }
  return email;
}

export function validateInstanceConfig(value) {
  assertNoSecrets(value);
  const input = assertObject(value, "instance configuration");
  assertOnlyKeys(input, TOP_LEVEL_KEYS, "instance configuration");

  if (input.version !== 1) {
    throw new Error("version must be 1");
  }
  const publicOrigin = parsePublicOrigin(input.publicOrigin);
  const frontendBasePath = parseFrontendBasePath(input.frontendBasePath);

  const brandingInput = assertObject(input.branding, "branding");
  assertOnlyKeys(brandingInput, BRANDING_KEYS, "branding");
  const branding = {};
  for (const key of REQUIRED_IDENTITY_KEYS) {
    branding[key] = requiredString(brandingInput[key], `branding.${key}`);
  }
  if (!/^#[0-9a-f]{6}$/i.test(branding.themeColor)) {
    throw new Error(
      "branding.themeColor must be a six-digit hexadecimal color",
    );
  }
  branding.websiteUrl =
    brandingInput.websiteUrl === undefined
      ? undefined
      : parseAbsoluteUrl(brandingInput.websiteUrl, "branding.websiteUrl");
  branding.contactEmail =
    brandingInput.contactEmail === undefined
      ? undefined
      : validateEmail(brandingInput.contactEmail, "branding.contactEmail");

  const assetsInput = assertObject(
    brandingInput.assets ?? {},
    "branding.assets",
  );
  assertOnlyKeys(assetsInput, ASSET_KEYS, "branding.assets");
  branding.assets = Object.fromEntries(
    ASSET_KEYS.flatMap((key) => {
      const parsed = parseOptionalPublicUrl(
        assetsInput[key],
        publicOrigin,
        `branding.assets.${key}`,
      );
      return parsed === undefined ? [] : [[key, parsed]];
    }),
  );

  const linksInput = assertObject(input.links ?? {}, "links");
  assertOnlyKeys(linksInput, LINK_KEYS, "links");
  const links = Object.fromEntries(
    LINK_KEYS.flatMap((key) => {
      const parsed = parseOptionalPublicUrl(
        linksInput[key],
        publicOrigin,
        `links.${key}`,
      );
      return parsed === undefined ? [] : [[key, parsed]];
    }),
  );

  const serverInput = assertObject(input.server ?? {}, "server");
  assertOnlyKeys(serverInput, SERVER_KEYS, "server");
  const server = {
    name: optionalString(serverInput.name, "server.name"),
    motd: optionalString(serverInput.motd, "server.motd"),
    iconUrl: parseOptionalPublicUrl(
      serverInput.iconUrl,
      publicOrigin,
      "server.iconUrl",
    ),
  };

  return {
    version: 1,
    publicOrigin,
    frontendBasePath,
    branding,
    links,
    server: Object.fromEntries(
      Object.entries(server).filter(([, item]) => item !== undefined),
    ),
    startRoomUrl: parseOptionalPublicUrl(
      input.startRoomUrl,
      publicOrigin,
      "startRoomUrl",
    ),
  };
}

function resolvePublicUrl(value, publicOrigin) {
  return value === undefined
    ? undefined
    : new URL(value, `${publicOrigin}/`).toString();
}

function resolveStartRoomUrl(value, publicOrigin, frontendBasePath) {
  const resolvedUrl = resolvePublicUrl(value, publicOrigin);
  if (resolvedUrl === undefined || frontendBasePath === "") {
    return resolvedUrl;
  }

  const url = new URL(resolvedUrl);
  if (
    url.origin === publicOrigin &&
    url.pathname !== frontendBasePath &&
    !url.pathname.startsWith(`${frontendBasePath}/`)
  ) {
    url.pathname = `${frontendBasePath}${url.pathname}`;
  }
  return url.toString();
}

function setIfDefined(environment, key, value) {
  if (value !== undefined) {
    environment[key] = value;
  }
}

export function projectComposeEnvironment(value, options = {}) {
  const config = validateInstanceConfig(value);
  const publicOrigin = config.publicOrigin;
  const frontendUrl = `${publicOrigin}${config.frontendBasePath}`;
  const originUrl = new URL(publicOrigin);
  const websiteUrl =
    config.branding.websiteUrl?.replace(/\/+$/, "") ?? publicOrigin;
  const contactEmail =
    config.branding.contactEmail ?? `hello@${new URL(websiteUrl).hostname}`;
  const environment = {
    INSTANCE_CONFIG_FILE: resolve(
      options.instanceConfigFile ?? "instance.config.json",
    ),
    DOMAIN: originUrl.hostname,
    PUBLIC_ORIGIN: publicOrigin,
    PLAY_URL: publicOrigin,
    PUSHER_URL: publicOrigin,
    FRONT_URL: frontendUrl,
    ALLOWED_CORS_ORIGIN: publicOrigin,
    PUBLIC_MAP_STORAGE_URL: `${publicOrigin}/map-storage`,
    UPLOADER_URL: `${publicOrigin}/uploader`,
    ICON_URL: `${publicOrigin}/icon`,
    TEAPOT_MCP_PUBLIC_URL: `${publicOrigin}/mcp`,
    TEAPOT_WOKA_PUBLIC_BASE_URL: publicOrigin,
    TEAPOT_X_REDIRECT_URI: `${publicOrigin}/teapot/auth/x/callback`,
    TEAPOT_MCP_ALLOWED_HOSTS: `${originUrl.host},localhost:17374,127.0.0.1:17374`,
    ENTITY_COLLECTION_URLS: `${publicOrigin}/collections/FurnitureCollection.json,${publicOrigin}/collections/OfficeCollection.json`,
    BRAND_NAME: config.branding.name,
    BRAND_SHORT_NAME: config.branding.shortName,
    BRAND_DESCRIPTION: config.branding.description,
    BRAND_AUTHOR: config.branding.author,
    BRAND_PROVIDER: config.branding.provider,
    BRAND_THEME_COLOR: config.branding.themeColor,
    BRAND_WEBSITE_URL: websiteUrl,
    BRAND_CONTACT_EMAIL: contactEmail,
    CONTACT_URL:
      resolvePublicUrl(config.links.contactUrl, publicOrigin) ??
      `mailto:${contactEmail}`,
    SERVER_NAME: config.server.name ?? `${config.branding.name} Server`,
    SERVER_MOTD: config.server.motd ?? `A ${config.branding.name} Server`,
  };

  for (const [assetKey, environmentKey] of Object.entries(
    ASSET_ENVIRONMENT_KEYS,
  )) {
    setIfDefined(
      environment,
      environmentKey,
      resolvePublicUrl(config.branding.assets[assetKey], publicOrigin),
    );
  }
  setIfDefined(
    environment,
    "REPORT_ISSUES_URL",
    resolvePublicUrl(config.links.issuesUrl, publicOrigin),
  );
  if (config.links.issuesUrl !== undefined) {
    environment.ENABLE_REPORT_ISSUES_MENU = "true";
  }
  setIfDefined(
    environment,
    "SERVER_ICON",
    resolvePublicUrl(
      config.server.iconUrl ?? config.branding.assets.manifestIcon,
      publicOrigin,
    ),
  );
  setIfDefined(
    environment,
    "START_ROOM_URL",
    resolveStartRoomUrl(
      config.startRoomUrl,
      publicOrigin,
      config.frontendBasePath,
    ),
  );

  return environment;
}

function quoteEnvironmentValue(value) {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/"/g, '\\"')
    .replace(/\$/g, () => "$$")}"`;
}

export function serializeComposeEnvironment(environment) {
  return `${Object.entries(environment)
    .map(([key, value]) => `${key}=${quoteEnvironmentValue(value)}`)
    .join("\n")}\n`;
}

export async function loadInstanceConfig(configPath) {
  const resolvedPath = resolve(configPath);
  let source;
  try {
    source = await readFile(resolvedPath, "utf8");
  } catch (error) {
    throw new Error(
      `Unable to read instance configuration at ${resolvedPath}`,
      { cause: error },
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Malformed JSON in instance configuration at ${resolvedPath}`,
      { cause: error },
    );
  }
  try {
    return validateInstanceConfig(parsed);
  } catch (error) {
    throw new Error(
      `Invalid instance configuration at ${resolvedPath}: ${error.message}`,
      { cause: error },
    );
  }
}

function parseArguments(arguments_) {
  let configPath;
  let outputPath;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--output" || argument === "-o") {
      outputPath = arguments_[index + 1];
      if (!outputPath) {
        throw new Error(`${argument} requires a file path`);
      }
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      return { help: true };
    } else if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (configPath === undefined) {
      configPath = argument;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }
  if (!configPath) {
    throw new Error("An instance configuration path is required");
  }
  return { configPath, outputPath };
}

export async function main(arguments_ = process.argv.slice(2)) {
  const options = parseArguments(arguments_);
  if (options.help) {
    process.stdout.write(
      "Usage: node contrib/docker/instance-config.mjs <instance.config.json> [--output <compose.env>]\n",
    );
    return;
  }

  const configPath = resolve(options.configPath);
  const config = await loadInstanceConfig(configPath);
  const output = serializeComposeEnvironment(
    projectComposeEnvironment(config, { instanceConfigFile: configPath }),
  );
  if (options.outputPath) {
    await writeFile(resolve(options.outputPath), output, "utf8");
  } else {
    process.stdout.write(output);
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMainModule) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
