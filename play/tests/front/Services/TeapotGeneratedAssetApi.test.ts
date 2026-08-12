import { describe, expect, it, vi } from "vitest";

import { TeapotGeneratedAssetApi } from "../../../src/front/Services/TeapotGeneratedAssetApi";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const view = {
    id: "asset-1",
    name: "Forest shrine",
    url: "https://play.example.test/teapot/generated-assets/asset-1.png",
    kind: "map-entity" as const,
    width: 96,
    height: 128,
    sha256: "a".repeat(64),
    createdAt: "2026-08-12T09:00:00.000Z",
};

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

function toUrl(input: RequestInfo | URL | undefined): URL {
    if (input instanceof URL) return input;
    if (typeof input === "string") return new URL(input);
    if (input instanceof Request) return new URL(input.url);
    throw new Error("Expected the API to issue a request");
}

describe("TeapotGeneratedAssetApi", () => {
    it("accepts a validated SHA-256 fingerprint in upload and list views", async () => {
        const animation = {
            frameWidth: 32,
            frameHeight: 32,
            frameCount: 3,
            frameDurationMs: 200,
        };
        const fetcher = vi
            .fn<Fetcher>()
            .mockResolvedValueOnce(json({ ...view, animation }, 201))
            .mockResolvedValueOnce(json({ items: [{ ...view, animation }] }));
        const api = new TeapotGeneratedAssetApi("https://play.example.test/", () => "private-token", fetcher);

        await expect(
            api.upload(new Blob(["png"], { type: "image/png" }), "Forest shrine", "map-entity", {
                source: "generated",
                animation,
            }),
        ).resolves.toEqual({ ...view, animation });
        const uploadUrl = fetcher.mock.calls[0]?.[0];
        expect(toUrl(uploadUrl).searchParams.get("animation")).toBe(JSON.stringify(animation));
        await expect(api.list("map-entity")).resolves.toEqual([{ ...view, animation }]);
    });

    it("rejects upload and list views without a valid SHA-256 fingerprint", async () => {
        const invalidView = { ...view, sha256: "not-a-sha256" };
        const fetcher = vi
            .fn<Fetcher>()
            .mockResolvedValueOnce(json(invalidView, 201))
            .mockResolvedValueOnce(json({ items: [invalidView] }));
        const api = new TeapotGeneratedAssetApi("https://play.example.test/", () => "private-token", fetcher);

        await expect(
            api.upload(new Blob(["png"], { type: "image/png" }), "Forest shrine", "map-entity", {
                source: "generated",
            }),
        ).rejects.toThrow();
        await expect(api.list("map-entity")).rejects.toThrow();
    });

    it("uploads a native-resolution terrain surface with a logical 5×5 grid", async () => {
        const surface = {
            ...view,
            kind: "terrain-surface" as const,
            name: "Loam",
            width: 1000,
            height: 1000,
            surfaceGrid: { columns: 5 as const, rows: 5 as const, tilePixelSize: 200 },
        };
        const fetcher = vi.fn<Fetcher>().mockResolvedValueOnce(json(surface, 201));
        const api = new TeapotGeneratedAssetApi("https://play.example.test/", () => "private-token", fetcher);

        await expect(
            api.upload(new Blob(["png"], { type: "image/png" }), "Loam", "terrain-surface", {
                source: "generated",
                surfaceGrid: surface.surfaceGrid,
            }),
        ).resolves.toEqual(surface);
        const uploadUrl = toUrl(fetcher.mock.calls[0]?.[0]);
        expect(uploadUrl.searchParams.get("gridColumns")).toBe("5");
        expect(uploadUrl.searchParams.get("gridRows")).toBe("5");
        expect(uploadUrl.searchParams.get("tilePixelSize")).toBe("200");
    });
});
