import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

function isHttpUrlWithoutCredentials(value: string, base?: string): boolean {
    try {
        const url = base === undefined ? new URL(value) : new URL(value, base);
        return (url.protocol === "http:" || url.protocol === "https:") && url.username === "" && url.password === "";
    } catch {
        return false;
    }
}

const httpUrlSchema = z
    .string()
    .url()
    .refine(isHttpUrlWithoutCredentials, "Must be an HTTP or HTTPS URL without credentials");

const publicOriginSchema = httpUrlSchema.refine((value) => {
    try {
        const url = new URL(value);
        return url.pathname === "/" && url.search === "" && url.hash === "";
    } catch {
        return false;
    }
}, "Must contain only the scheme, hostname, and optional port");

function normalizeFrontendBasePath(value: string): string | undefined {
    if (value === "" || value === "/") {
        return "";
    }
    if (
        value.trim() !== value ||
        !value.startsWith("/") ||
        value.startsWith("//") ||
        value.endsWith("/") ||
        value.includes("//") ||
        value.includes("?") ||
        value.includes("#") ||
        value.includes("\\")
    ) {
        return undefined;
    }

    for (const segment of value.slice(1).split("/")) {
        let decodedSegment: string;
        try {
            decodedSegment = decodeURIComponent(segment);
        } catch {
            return undefined;
        }
        if (
            decodedSegment === "." ||
            decodedSegment === ".." ||
            decodedSegment.includes("/") ||
            decodedSegment.includes("\\") ||
            [...decodedSegment].some((character) => {
                const codePoint = character.codePointAt(0);
                return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
            })
        ) {
            return undefined;
        }
    }

    return value;
}

const frontendBasePathSchema = z
    .string()
    .refine((value) => normalizeFrontendBasePath(value) !== undefined, {
        message:
            "Must be empty, /, or a canonical leading-slash path without a trailing slash, query, hash, or traversal",
    })
    .transform((value) => normalizeFrontendBasePath(value) as string)
    .default("");

const publicUrlSchema = z
    .string()
    .min(1)
    .refine(
        (value) => isHttpUrlWithoutCredentials(value, "https://instance.invalid/"),
        "Must be an HTTP(S) URL or a same-origin path without credentials",
    );

const optionalPublicUrl = publicUrlSchema.optional();

const InstanceBrandAssetsSchema = z
    .object({
        logo: optionalPublicUrl,
        loadingLogo: optionalPublicUrl,
        loginLogo: optionalPublicUrl,
        errorLogo: optionalPublicUrl,
        errorImage: optionalPublicUrl,
        loadingBackground: optionalPublicUrl,
        pwaBackground: optionalPublicUrl,
        poweredByLogo: optionalPublicUrl,
        statusIcon: optionalPublicUrl,
        statusCharacter: optionalPublicUrl,
        statusFontImage: optionalPublicUrl,
        statusFontData: optionalPublicUrl,
        favicon: optionalPublicUrl,
        manifestIcon: optionalPublicUrl,
        cardImage: optionalPublicUrl,
    })
    .strict()
    .default({});

export const InstanceConfigSchema = z
    .object({
        version: z.literal(1),
        publicOrigin: publicOriginSchema,
        frontendBasePath: frontendBasePathSchema,
        branding: z
            .object({
                name: z.string().min(1),
                shortName: z.string().min(1),
                description: z.string().min(1),
                author: z.string().min(1),
                provider: z.string().min(1),
                themeColor: z.string().regex(/^#[0-9a-f]{6}$/i, "Must be a six-digit hexadecimal color"),
                websiteUrl: httpUrlSchema.optional(),
                contactEmail: z.string().email().optional(),
                assets: InstanceBrandAssetsSchema,
            })
            .strict(),
        links: z
            .object({
                contactUrl: optionalPublicUrl,
                issuesUrl: optionalPublicUrl,
            })
            .strict()
            .default({}),
        server: z
            .object({
                name: z.string().min(1).optional(),
                motd: z.string().min(1).optional(),
                iconUrl: optionalPublicUrl,
            })
            .strict()
            .default({}),
        startRoomUrl: optionalPublicUrl,
    })
    .strict();

export type InstanceConfig = z.infer<typeof InstanceConfigSchema>;

function withoutTrailingSlash(value: string): string {
    return value.replace(/\/+$/, "");
}

function resolvePublicUrl(value: string | undefined, publicOrigin: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    try {
        const url = new URL(value, `${publicOrigin}/`);
        if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
            throw new Error(`Invalid public URL in instance configuration: ${value}`);
        }
        return url.toString();
    } catch (error) {
        throw new Error(`Invalid public URL in instance configuration: ${value}`, { cause: error });
    }
}

function resolveStartRoomUrl(
    value: string | undefined,
    publicOrigin: string,
    frontendBasePath: string,
): string | undefined {
    const resolvedUrl = resolvePublicUrl(value, publicOrigin);
    if (resolvedUrl === undefined || frontendBasePath === "") {
        return resolvedUrl;
    }

    const url = new URL(resolvedUrl);
    if (
        url.origin === new URL(publicOrigin).origin &&
        url.pathname !== frontendBasePath &&
        !url.pathname.startsWith(`${frontendBasePath}/`)
    ) {
        url.pathname = `${frontendBasePath}${url.pathname}`;
    }
    return url.toString();
}

function definedEntries(values: Record<string, string | undefined>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );
}

export function projectInstanceConfigToEnvironment(config: InstanceConfig): Record<string, string> {
    const publicOrigin = withoutTrailingSlash(config.publicOrigin);
    const frontendUrl = `${publicOrigin}${config.frontendBasePath}`;
    const websiteUrl = withoutTrailingSlash(config.branding.websiteUrl ?? publicOrigin);
    const contactEmail = config.branding.contactEmail ?? `hello@${new URL(websiteUrl).hostname}`;
    const assets = config.branding.assets;

    return definedEntries({
        PUSHER_URL: publicOrigin,
        FRONT_URL: frontendUrl,
        ALLOWED_CORS_ORIGIN: publicOrigin,
        PUBLIC_MAP_STORAGE_URL: `${publicOrigin}/map-storage`,
        UPLOADER_URL: `${publicOrigin}/uploader`,
        ICON_URL: `${publicOrigin}/icon`,
        TEAPOT_MCP_PUBLIC_URL: `${publicOrigin}/mcp`,
        TEAPOT_WOKA_PUBLIC_BASE_URL: publicOrigin,
        TEAPOT_X_REDIRECT_URI: `${publicOrigin}/teapot/auth/x/callback`,
        BRAND_NAME: config.branding.name,
        BRAND_SHORT_NAME: config.branding.shortName,
        BRAND_DESCRIPTION: config.branding.description,
        BRAND_AUTHOR: config.branding.author,
        BRAND_PROVIDER: config.branding.provider,
        BRAND_THEME_COLOR: config.branding.themeColor,
        BRAND_WEBSITE_URL: websiteUrl,
        BRAND_CONTACT_EMAIL: contactEmail,
        BRAND_LOGO_URL: resolvePublicUrl(assets.logo, publicOrigin),
        BRAND_LOADING_LOGO_URL: resolvePublicUrl(assets.loadingLogo, publicOrigin),
        BRAND_LOGIN_LOGO_URL: resolvePublicUrl(assets.loginLogo, publicOrigin),
        BRAND_ERROR_LOGO_URL: resolvePublicUrl(assets.errorLogo, publicOrigin),
        BRAND_ERROR_IMAGE_URL: resolvePublicUrl(assets.errorImage, publicOrigin),
        BRAND_LOADING_BACKGROUND_URL: resolvePublicUrl(assets.loadingBackground, publicOrigin),
        BRAND_PWA_BACKGROUND_URL: resolvePublicUrl(assets.pwaBackground, publicOrigin),
        BRAND_POWERED_BY_LOGO_URL: resolvePublicUrl(assets.poweredByLogo, publicOrigin),
        BRAND_STATUS_ICON_URL: resolvePublicUrl(assets.statusIcon, publicOrigin),
        BRAND_STATUS_CHARACTER_URL: resolvePublicUrl(assets.statusCharacter, publicOrigin),
        BRAND_STATUS_FONT_IMAGE_URL: resolvePublicUrl(assets.statusFontImage, publicOrigin),
        BRAND_STATUS_FONT_DATA_URL: resolvePublicUrl(assets.statusFontData, publicOrigin),
        BRAND_FAVICON_URL: resolvePublicUrl(assets.favicon, publicOrigin),
        BRAND_MANIFEST_ICON_URL: resolvePublicUrl(assets.manifestIcon, publicOrigin),
        BRAND_CARD_IMAGE_URL: resolvePublicUrl(assets.cardImage, publicOrigin),
        CONTACT_URL: resolvePublicUrl(config.links.contactUrl, publicOrigin) ?? `mailto:${contactEmail}`,
        REPORT_ISSUES_URL: resolvePublicUrl(config.links.issuesUrl, publicOrigin),
        SERVER_NAME: config.server.name ?? `${config.branding.name} Server`,
        SERVER_MOTD: config.server.motd ?? `A ${config.branding.name} Server`,
        SERVER_ICON: resolvePublicUrl(config.server.iconUrl ?? assets.manifestIcon, publicOrigin),
        START_ROOM_URL: resolveStartRoomUrl(config.startRoomUrl, publicOrigin, config.frontendBasePath),
    });
}

export function loadInstanceConfigEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const configPath = environment.INSTANCE_CONFIG_PATH?.trim();
    if (!configPath) {
        return environment;
    }

    let parsedJson: unknown;
    const resolvedPath = resolve(configPath);
    try {
        parsedJson = JSON.parse(readFileSync(resolvedPath, "utf8")) as unknown;
    } catch (error) {
        throw new Error(`Unable to read instance configuration at ${resolvedPath}`, { cause: error });
    }

    const parsedConfig = InstanceConfigSchema.safeParse(parsedJson);
    if (!parsedConfig.success) {
        throw new Error(`Invalid instance configuration at ${resolvedPath}: ${parsedConfig.error.message}`);
    }

    const explicitEnvironment = Object.fromEntries(
        Object.entries(environment).filter((entry): entry is [string, string] => entry[1] !== undefined),
    );

    return {
        ...projectInstanceConfigToEnvironment(parsedConfig.data),
        ...explicitEnvironment,
        INSTANCE_CONFIG_PATH: resolvedPath,
    };
}
