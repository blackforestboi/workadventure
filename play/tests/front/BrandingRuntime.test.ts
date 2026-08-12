import { describe, expect, it } from "vitest";
import { replaceLegacyBrand } from "../../src/front/BrandingRuntime";

describe("replaceLegacyBrand", () => {
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
});
