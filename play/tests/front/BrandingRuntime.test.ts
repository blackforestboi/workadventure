import { describe, expect, it } from "vitest";
import { BRANDING } from "../../src/front/Branding";
import { installBrandingRuntime, replaceLegacyBrand } from "../../src/front/BrandingRuntime";

describe("replaceLegacyBrand", () => {
    it("exposes the configured favicon and loading-screen logo", () => {
        expect(BRANDING.assets.favicon).toBe("https://assets.example.test/favicon.svg");
        expect(BRANDING.assets.loadingLogo).toBe("https://assets.example.test/loading-logo.svg");
    });

    it("replaces legacy product-name wording with the configured brand", () => {
        expect(replaceLegacyBrand("WorkAdventure and WorkAdventures are replaced.")).toBe(
            "tpot.world and tpot.world are replaced.",
        );
    });

    it("does not rewrite URL-like internal identifiers", () => {
        expect(replaceLegacyBrand("workadventure.localhost/workadventure")).toBe(
            "workadventure.localhost/workadventure",
        );
    });

    it("rewrites legacy website and support links", () => {
        const rewritten = replaceLegacyBrand("https://workadventu.re/faq hello@workadventu.re");

        expect(rewritten).toContain("tpot.world");
        expect(rewritten).not.toContain("workadventu.re");
    });

    it("applies the configured favicon to the browser document", () => {
        document.head.innerHTML = '<link rel="icon" type="image/png" sizes="32x32" href="/legacy.png">';

        const uninstall = installBrandingRuntime();
        const favicon = document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');

        expect(favicon?.href).toBe("https://assets.example.test/favicon.svg");
        expect(favicon?.hasAttribute("sizes")).toBe(false);
        expect(favicon?.hasAttribute("type")).toBe(false);
        uninstall();
    });
});
