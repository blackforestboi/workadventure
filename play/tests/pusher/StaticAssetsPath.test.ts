// @vitest-environment node

import { describe, expect, it } from "vitest";

import { resolveStaticAssetsPath } from "../../src/pusher/services/StaticAssetsPath";

const existingPaths =
    (...paths: string[]) =>
    (path: string) =>
        paths.includes(path);

describe("resolveStaticAssetsPath", () => {
    it("prefers live public assets in development even when a stale build exists", () => {
        expect(resolveStaticAssetsPath("development", existingPaths("public", "dist/public"))).toBe("public");
    });

    it("prefers built public assets in production", () => {
        expect(resolveStaticAssetsPath("production", existingPaths("public", "dist/public"))).toBe("dist/public");
    });

    it("falls back to the available public directory", () => {
        expect(resolveStaticAssetsPath("development", existingPaths("dist/public"))).toBe("dist/public");
        expect(resolveStaticAssetsPath("production", existingPaths("public"))).toBe("public");
    });

    it("fails clearly when no public directory exists", () => {
        expect(() => resolveStaticAssetsPath("development", () => false)).toThrow("Could not find public folder");
    });
});
