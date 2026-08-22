import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    copyFileSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import Mustache from "mustache";
import {
    InstanceConfigSchema,
    projectInstanceConfigToEnvironment,
    type InstanceConfig,
} from "../src/pusher/config/InstanceConfig";
import { EnvironmentVariables } from "../src/pusher/enums/EnvironmentVariableValidator";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const playRoot = resolve(scriptDirectory, "..");
const repositoryRoot = resolve(playRoot, "..");

const DEFAULT_CONFIG_CANDIDATES = [
    resolve(repositoryRoot, "contrib/docker/instance.config.json"),
    resolve(repositoryRoot, "contrib/docker/instance.config.example.json"),
];
const DEFAULT_OUTPUT_DIRECTORY = resolve(repositoryRoot, "artifacts/tpot-maps-web");
const STABLE_ARCHIVE_NAME = "tpot-maps-web.tgz";
const PACKAGE_NAME = "@tpot-maps/web-build";

type FrontEnvironment = Record<string, unknown> & {
    BRAND_NAME?: string;
    BRAND_SHORT_NAME?: string;
    BRAND_DESCRIPTION?: string;
    BRAND_AUTHOR?: string;
    BRAND_PROVIDER?: string;
    BRAND_THEME_COLOR?: string;
    BRAND_FAVICON_URL?: string;
    BRAND_MANIFEST_ICON_URL?: string;
    BRAND_CARD_IMAGE_URL?: string;
};

export interface StaticWebPackageOptions {
    configPath: string;
    capabilities?: Record<string, unknown>;
    outputDirectory?: string;
    builtPublicDirectory?: string;
    now?: Date;
    pack?: boolean;
}

function resolveCliPath(value: string): string {
    return isAbsolute(value) ? value : resolve(repositoryRoot, value);
}

function defaultConfigPath(): string {
    const configPath = DEFAULT_CONFIG_CANDIDATES.find(existsSync);
    if (configPath === undefined) {
        throw new Error(
            "No instance configuration found. Pass --config <path> or create contrib/docker/instance.config.json.",
        );
    }
    return configPath;
}

function parseArguments(args: string[]): StaticWebPackageOptions {
    let configPath: string | undefined;
    let outputDirectory: string | undefined;
    let capabilities: Record<string, unknown> | undefined;

    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === "--config") {
            configPath = args[++index];
        } else if (argument === "--out-dir") {
            outputDirectory = args[++index];
        } else if (argument === "--capabilities") {
            const capabilitiesPath = args[++index];
            if (capabilitiesPath === undefined) {
                throw new Error("--capabilities requires a JSON file path");
            }
            const parsedCapabilities = JSON.parse(readFileSync(resolveCliPath(capabilitiesPath), "utf8")) as unknown;
            if (
                typeof parsedCapabilities !== "object" ||
                parsedCapabilities === null ||
                Array.isArray(parsedCapabilities)
            ) {
                throw new Error("The capabilities JSON must contain an object");
            }
            capabilities = parsedCapabilities as Record<string, unknown>;
        } else if (argument === "--help" || argument === "-h") {
            console.log(`Usage: npm run package:web -- [options]

Options:
  --config <path>   Unified instance config (defaults to the local config, then the example)
  --out-dir <path>  Unpacked package directory (defaults to artifacts/tpot-maps-web)
  --capabilities <path>  Optional public capability map JSON (defaults to {})
  --help            Show this help`);
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }

    if (configPath === undefined) {
        configPath = defaultConfigPath();
    }
    if (outputDirectory === undefined) {
        outputDirectory = DEFAULT_OUTPUT_DIRECTORY;
    }

    return {
        configPath: resolveCliPath(configPath),
        outputDirectory: resolveCliPath(outputDirectory),
        capabilities,
    };
}

export function readInstanceConfig(configPath: string): InstanceConfig {
    let input: unknown;
    try {
        input = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    } catch (error) {
        throw new Error(`Unable to read instance configuration at ${configPath}`, { cause: error });
    }
    return InstanceConfigSchema.parse(input);
}

function serializeForInlineScript(value: unknown): string {
    return JSON.stringify(value)
        .replaceAll("<", "\\u003c")
        .replaceAll("\u2028", "\\u2028")
        .replaceAll("\u2029", "\\u2029");
}

export function assertNoTemplateTokens(html: string): void {
    const unresolvedToken = html.match(/{{{?[#/^!&>]?\s*[^{}]+\s*}?}}/);
    if (unresolvedToken !== null) {
        throw new Error(`Static index still contains an unresolved template token: ${unresolvedToken[0]}`);
    }
}

export function renderStaticIndex(
    template: string,
    frontEnvironment: FrontEnvironment,
    publicOrigin: string,
    capabilities: Record<string, unknown> = {},
    frontendBasePath = "",
): string {
    const frontendPath = `${frontendBasePath}/`;
    const frontendUrl = new URL(frontendPath, `${publicOrigin}/`).toString();
    const escapedFrontendPath = frontendPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const favicon = frontEnvironment.BRAND_FAVICON_URL ?? "/static/images/branding/default-icon.svg";
    const cardImage = frontEnvironment.BRAND_CARD_IMAGE_URL ?? favicon;
    const rendered = Mustache.render(template, {
        title: frontEnvironment.BRAND_NAME ?? "Virtual World",
        description: frontEnvironment.BRAND_DESCRIPTION ?? "A self-hosted virtual world",
        author: frontEnvironment.BRAND_AUTHOR ?? "Instance operator",
        provider: frontEnvironment.BRAND_PROVIDER ?? "Instance operator",
        themeColor: frontEnvironment.BRAND_THEME_COLOR ?? "#000000",
        msApplicationTileImage: favicon,
        url: frontendUrl,
        cardImage,
        favIcons: [{ rel: "icon", sizes: "512x512", src: favicon }],
        script: `window.env = ${serializeForInlineScript(frontEnvironment)};\nwindow.capabilities = ${serializeForInlineScript(capabilities)};`,
        authToken: "",
        googleDrivePickerClientId: undefined,
        cssVariablesOverride: "",
        posthogApiKey: undefined,
        posthogUrl: undefined,
        logRocketId: undefined,
        userId: undefined,
    })
        .replace(/<base href="\/" \/>/, `<base href="${frontendPath}" />`)
        .replace(
            new RegExp(`(?:${escapedFrontendPath}|/)static/images/favicons/manifest\\.json\\?url=[^"']*`),
            `${frontendPath}manifest.webmanifest`,
        );

    assertNoTemplateTokens(rendered);
    return rendered;
}

export function createStaticManifest(
    frontEnvironment: FrontEnvironment,
    publicOrigin: string,
    frontendBasePath = "",
): object {
    const icon =
        frontEnvironment.BRAND_MANIFEST_ICON_URL ??
        frontEnvironment.BRAND_FAVICON_URL ??
        "/static/images/branding/default-icon.svg";
    return {
        name: frontEnvironment.BRAND_NAME ?? "Virtual World",
        short_name: frontEnvironment.BRAND_SHORT_NAME ?? frontEnvironment.BRAND_NAME ?? "World",
        description: frontEnvironment.BRAND_DESCRIPTION ?? "A self-hosted virtual world",
        start_url: new URL(`${frontendBasePath}/`, `${publicOrigin}/`).toString(),
        scope: new URL(`${frontendBasePath}/`, `${publicOrigin}/`).toString(),
        display: "standalone",
        background_color: frontEnvironment.BRAND_THEME_COLOR ?? "#000000",
        theme_color: frontEnvironment.BRAND_THEME_COLOR ?? "#000000",
        icons: [{ src: icon, sizes: "any" }],
    };
}

function runPlayBuild(config: InstanceConfig): void {
    const viteBasePath = `${config.frontendBasePath}/`;
    execFileSync("npm", ["run", "build"], {
        cwd: playRoot,
        env: { ...process.env, VITE_BASE_PATH: viteBasePath },
        stdio: "inherit",
    });
}

export function stageStaticPublicFiles(
    builtPublicDirectory: string,
    publicDirectory: string,
    frontendBasePath: string,
): { indexPath: string; manifestPath: string } {
    cpSync(builtPublicDirectory, publicDirectory, { recursive: true });
    if (frontendBasePath === "") {
        return {
            indexPath: join(publicDirectory, "index.html"),
            manifestPath: join(publicDirectory, "manifest.webmanifest"),
        };
    }

    const frontendDirectory = join(publicDirectory, frontendBasePath.slice(1));
    mkdirSync(frontendDirectory, { recursive: true });
    renameSync(join(publicDirectory, "index.html"), join(frontendDirectory, "index.html"));
    renameSync(join(publicDirectory, "assets"), join(frontendDirectory, "assets"));
    return {
        indexPath: join(frontendDirectory, "index.html"),
        manifestPath: join(frontendDirectory, "manifest.webmanifest"),
    };
}

async function loadFrontEnvironment(configPath: string, config: InstanceConfig): Promise<FrontEnvironment> {
    const projectedEnvironment = projectInstanceConfigToEnvironment(config);
    for (const key of EnvironmentVariables.keyof().options) {
        delete process.env[key];
    }
    for (const [key, value] of Object.entries(projectedEnvironment)) {
        process.env[key] = value;
    }
    process.env.INSTANCE_CONFIG_PATH = configPath;
    process.env.NODE_ENV = "production";
    process.env.SECRET_KEY = "static-web-package-build-only";
    process.env.MAP_STORAGE_API_TOKEN = "static-web-package-build-only";
    process.env.API_URL = `${config.publicOrigin}/api`;
    process.env.INTERNAL_MAP_STORAGE_URL = `${config.publicOrigin}/map-storage`;

    const environmentModule = await import("../src/pusher/enums/EnvironmentVariable");
    return environmentModule.FRONT_ENVIRONMENT_VARIABLES as unknown as FrontEnvironment;
}

function gitOutput(args: string[]): string {
    return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim();
}

function createCleanVersion(sourceRevision: string): string {
    const safeRevision = sourceRevision.replace(/[^0-9A-Za-z-]/g, "").slice(0, 12) || "unknown";
    return `0.0.0-${safeRevision}`;
}

function sourceStateFingerprint(sourceRevision: string): string {
    const hash = createHash("sha256");
    hash.update(sourceRevision);
    hash.update(execFileSync("git", ["diff", "--binary", "HEAD"], { cwd: repositoryRoot }));

    const untrackedFiles = gitOutput(["ls-files", "--others", "--exclude-standard", "-z"])
        .split("\0")
        .filter(Boolean)
        .sort();
    for (const file of untrackedFiles) {
        hash.update(`\0${file}\0`);
        hash.update(readFileSync(resolve(repositoryRoot, file)));
    }
    return hash.digest("hex").slice(0, 16);
}

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function assertSafeOutputDirectory(outputDirectory: string): void {
    const repositoryRelativeOutput = relative(repositoryRoot, outputDirectory);
    const outputContainsRepository =
        repositoryRoot === outputDirectory || repositoryRoot.startsWith(`${outputDirectory}${sep}`);
    const isInsideRepository =
        repositoryRelativeOutput !== "" &&
        !repositoryRelativeOutput.startsWith(`..${sep}`) &&
        !isAbsolute(repositoryRelativeOutput);

    if (
        resolve(outputDirectory, "..") === outputDirectory ||
        outputContainsRepository ||
        (isInsideRepository && !repositoryRelativeOutput.startsWith(`artifacts${sep}`))
    ) {
        throw new Error(`Refusing to replace broad output directory: ${outputDirectory}`);
    }

    if (!existsSync(outputDirectory) || readdirSync(outputDirectory).length === 0) {
        return;
    }

    try {
        const existingPackage = JSON.parse(readFileSync(join(outputDirectory, "package.json"), "utf8")) as {
            name?: string;
        };
        if (existingPackage.name === PACKAGE_NAME) {
            return;
        }
    } catch {
        // A non-package directory is rejected below.
    }
    throw new Error(`Refusing to replace non-package directory: ${outputDirectory}`);
}

function packDirectory(outputDirectory: string, artifactsDirectory: string): string {
    const packOutput = execFileSync("npm", ["pack", "--json", "--pack-destination", artifactsDirectory], {
        cwd: outputDirectory,
        encoding: "utf8",
    });
    const packResult = JSON.parse(packOutput) as Array<{ filename: string }>;
    const archiveName = packResult[0]?.filename;
    if (archiveName === undefined) {
        throw new Error("npm pack did not return an archive filename");
    }
    copyFileSync(join(artifactsDirectory, archiveName), join(artifactsDirectory, STABLE_ARCHIVE_NAME));
    return archiveName;
}

export async function buildStaticWebPackage(options: StaticWebPackageOptions): Promise<{
    outputDirectory: string;
    archivePath?: string;
    version: string;
}> {
    const configPath = resolve(options.configPath);
    const outputDirectory = resolve(options.outputDirectory ?? DEFAULT_OUTPUT_DIRECTORY);
    const builtPublicDirectory = resolve(options.builtPublicDirectory ?? join(playRoot, "dist/public"));
    const artifactsDirectory = dirname(outputDirectory);
    const now = options.now ?? new Date();

    if (!existsSync(join(builtPublicDirectory, "index.html"))) {
        throw new Error(`Play build not found at ${builtPublicDirectory}. Run npm run build --workspace=play first.`);
    }

    const config = readInstanceConfig(configPath);
    const frontEnvironment = await loadFrontEnvironment(configPath, config);
    const sourceRevision = gitOutput(["rev-parse", "--short=12", "HEAD"]);
    const dirty = gitOutput(["status", "--porcelain"]).length > 0;
    const fingerprint = sourceStateFingerprint(sourceRevision);
    const version = dirty ? `0.0.0-${sourceRevision}.dirty.${fingerprint}` : createCleanVersion(sourceRevision);

    assertSafeOutputDirectory(outputDirectory);
    rmSync(outputDirectory, { recursive: true, force: true });
    mkdirSync(outputDirectory, { recursive: true });
    const publicDirectory = join(outputDirectory, "public");
    const { indexPath, manifestPath } = stageStaticPublicFiles(
        builtPublicDirectory,
        publicDirectory,
        config.frontendBasePath,
    );

    writeFileSync(
        indexPath,
        renderStaticIndex(
            readFileSync(indexPath, "utf8"),
            frontEnvironment,
            config.publicOrigin,
            options.capabilities,
            config.frontendBasePath,
        ),
        "utf8",
    );
    writeJson(manifestPath, createStaticManifest(frontEnvironment, config.publicOrigin, config.frontendBasePath));

    const buildInfo = {
        formatVersion: 1,
        packageName: PACKAGE_NAME,
        packageVersion: version,
        sourceRevision,
        dirty,
        sourceStateFingerprint: fingerprint,
        builtAt: now.toISOString(),
        publicOrigin: config.publicOrigin,
        frontendBasePath: config.frontendBasePath,
        instanceConfig: relative(repositoryRoot, configPath) || configPath,
    };
    writeJson(join(outputDirectory, "build-info.json"), buildInfo);
    writeJson(join(outputDirectory, "package.json"), {
        name: PACKAGE_NAME,
        version,
        description: `Static ${frontEnvironment.BRAND_NAME ?? "virtual world"} browser build`,
        files: ["public", "build-info.json", "README.md"],
        exports: {
            "./build-info.json": "./build-info.json",
            "./package.json": "./package.json",
        },
    });
    writeFileSync(
        join(outputDirectory, "README.md"),
        `# Static browser build\n\nCopy the contents of \`public/\` into your website's output directory. See the source project's static web package documentation for backend routing requirements.\n`,
        "utf8",
    );

    let archivePath: string | undefined;
    if (options.pack !== false) {
        mkdirSync(artifactsDirectory, { recursive: true });
        const archiveName = packDirectory(outputDirectory, artifactsDirectory);
        archivePath = join(artifactsDirectory, archiveName);
    }

    return { outputDirectory, archivePath, version };
}

async function main(): Promise<void> {
    const options = parseArguments(process.argv.slice(2));
    runPlayBuild(readInstanceConfig(options.configPath));
    const result = await buildStaticWebPackage(options);
    console.log(`Static web dependency ready: ${result.outputDirectory}`);
    if (result.archivePath !== undefined) {
        console.log(`Versioned archive: ${result.archivePath}`);
        console.log(`Stable archive: ${join(dirname(result.outputDirectory), STABLE_ARCHIVE_NAME)}`);
    }
    console.log(`Package version: ${result.version}`);
}

const invokedScript = process.argv[1] === undefined ? undefined : resolve(process.argv[1]);
if (invokedScript === fileURLToPath(import.meta.url)) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
