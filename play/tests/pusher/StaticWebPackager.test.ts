import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    assertNoTemplateTokens,
    assertSafeOutputDirectory,
    createStaticManifest,
    renderStaticIndex,
    stageStaticPublicFiles,
} from "../../scripts/packageStaticWeb";

const indexTemplate = readFileSync(resolve(import.meta.dirname, "../../index.html"), "utf8");

describe("static web packager", () => {
    const frontEnvironment = {
        BRAND_NAME: "My World",
        BRAND_SHORT_NAME: "World",
        BRAND_DESCRIPTION: "A private universe",
        BRAND_AUTHOR: "Example operator",
        BRAND_PROVIDER: "Example provider",
        BRAND_THEME_COLOR: "#123456",
        BRAND_FAVICON_URL: "https://world.example/assets/favicon.png",
        BRAND_MANIFEST_ICON_URL: "https://world.example/assets/app-icon.png",
        BRAND_CARD_IMAGE_URL: "https://world.example/assets/card.png",
        START_ROOM_URL: "https://world.example/@/start",
    };

    it("pre-renders the real index template with config and capabilities", () => {
        const html = renderStaticIndex(indexTemplate, frontEnvironment, "https://world.example", {
            chat: true,
        });

        expect(html).toContain("<title>My World</title>");
        expect(html).toContain("https:&#x2F;&#x2F;world.example&#x2F;assets&#x2F;favicon.png");
        expect(html).toContain('href="/manifest.webmanifest"');
        expect(html).toContain('window.capabilities = {"chat":true};');
        expect(html).toContain('"START_ROOM_URL":"https://world.example/@/start"');
        expect(html).not.toContain("{{");
    });

    it("escapes values before placing the environment in an inline script", () => {
        const html = renderStaticIndex(
            indexTemplate,
            { ...frontEnvironment, BRAND_DESCRIPTION: "</script><script>alert(1)</script>" },
            "https://world.example",
        );

        expect(html).not.toContain("</script><script>alert(1)</script>");
        expect(html).toContain("\\u003c/script>\\u003cscript>alert(1)\\u003c/script>");
    });

    it("creates a static manifest from the configured brand assets", () => {
        expect(createStaticManifest(frontEnvironment, "https://world.example")).toEqual(
            expect.objectContaining({
                name: "My World",
                short_name: "World",
                theme_color: "#123456",
                start_url: "https://world.example/",
                icons: [{ src: "https://world.example/assets/app-icon.png", sizes: "any" }],
            }),
        );
    });

    it("renders HTML and manifest URLs below a configured frontend path", () => {
        const html = renderStaticIndex(indexTemplate, frontEnvironment, "https://olivers.tools", {}, "/play");

        expect(html).toContain('<base href="/play/" />');
        expect(html).toContain('href="/play/manifest.webmanifest"');
        expect(createStaticManifest(frontEnvironment, "https://olivers.tools", "/play")).toEqual(
            expect.objectContaining({
                start_url: "https://olivers.tools/play/",
                scope: "https://olivers.tools/play/",
            }),
        );
    });

    it("does not duplicate a frontend path already added to the manifest URL by Vite", () => {
        const viteOutput = indexTemplate.replace(
            "/static/images/favicons/manifest.json?url=",
            "/play/static/images/favicons/manifest.json?url=",
        );
        const html = renderStaticIndex(viteOutput, frontEnvironment, "https://olivers.tools", {}, "/play");

        expect(html).toContain('href="/play/manifest.webmanifest"');
        expect(html).not.toContain("/play/play/manifest.webmanifest");
    });

    it("stages Vite-owned files below the frontend path and keeps public resources at root", () => {
        const parent = mkdtempSync(resolve(tmpdir(), "static-web-layout-test-"));
        const built = resolve(parent, "built");
        const target = resolve(parent, "target");
        mkdirSync(resolve(built, "assets"), { recursive: true });
        mkdirSync(resolve(built, "static"), { recursive: true });
        mkdirSync(resolve(built, "collections"), { recursive: true });
        writeFileSync(resolve(built, "index.html"), "index");
        writeFileSync(resolve(built, "assets", "app.js"), "app");
        writeFileSync(resolve(built, "static", "logo.svg"), "logo");
        writeFileSync(resolve(built, "collections", "FurnitureCollection.json"), "{}");
        writeFileSync(resolve(built, "service-worker-prod.js"), "worker");

        const paths = stageStaticPublicFiles(built, target, "/play");

        expect(paths.indexPath).toBe(resolve(target, "play", "index.html"));
        expect(existsSync(resolve(target, "play", "assets", "app.js"))).toBe(true);
        expect(existsSync(resolve(target, "static", "logo.svg"))).toBe(true);
        expect(existsSync(resolve(target, "collections", "FurnitureCollection.json"))).toBe(true);
        expect(existsSync(resolve(target, "service-worker-prod.js"))).toBe(true);
        expect(existsSync(resolve(target, "assets"))).toBe(false);
    });

    it("preserves the original root layout when no frontend path is configured", () => {
        const parent = mkdtempSync(resolve(tmpdir(), "static-web-root-layout-test-"));
        const built = resolve(parent, "built");
        const target = resolve(parent, "target");
        mkdirSync(resolve(built, "assets"), { recursive: true });
        writeFileSync(resolve(built, "index.html"), "index");
        writeFileSync(resolve(built, "assets", "app.js"), "app");

        const paths = stageStaticPublicFiles(built, target, "");

        expect(paths.indexPath).toBe(resolve(target, "index.html"));
        expect(existsSync(resolve(target, "assets", "app.js"))).toBe(true);
    });

    it("rejects unresolved template tokens", () => {
        expect(() => assertNoTemplateTokens("<title>{{ missing }}</title>")).toThrow("unresolved template token");
    });

    it("refuses to replace a non-package output directory", () => {
        const parent = mkdtempSync(resolve(tmpdir(), "static-web-package-test-"));
        const output = resolve(parent, "website");
        mkdirSync(output);
        writeFileSync(resolve(output, "keep.txt"), "do not delete");

        expect(() => assertSafeOutputDirectory(output)).toThrow("non-package directory");
    });
});
