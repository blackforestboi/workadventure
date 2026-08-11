import { describe, expect, it, vi } from "vitest";

import { TeapotTilesetApi } from "../../../src/front/Services/TeapotTilesetApi";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const view = {
    id: "asset-1",
    name: "Forest floor",
    url: "https://play.example.test/teapot/tileset-assets/asset-1.png",
    width: 256,
    height: 256,
    columns: 8,
    rows: 8,
    createdAt: "2026-08-09T12:00:00.000Z",
};

function json(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("TeapotTilesetApi", () => {
    it("uploads PNG bytes with provenance and authentication outside the stable asset URL", async () => {
        const fetcher = vi.fn<Fetcher>(() => Promise.resolve(json(view, 201)));
        const blob = new Blob(["png"], { type: "image/png" });
        const api = new TeapotTilesetApi("https://play.example.test/", () => "private-token", fetcher);

        await expect(
            api.upload(blob, "Forest floor", { source: "generated", providerId: "openrouter", modelId: "image-1" }),
        ).resolves.toEqual(view);

        const [url, init] = fetcher.mock.calls[0];
        const href = typeof url === "string" ? url : url instanceof Request ? url.url : url.href;
        expect(href).toBe(
            "https://play.example.test/teapot/tilesets?name=Forest+floor&source=generated&providerId=openrouter&modelId=image-1",
        );
        expect(href).not.toContain("private-token");
        expect(init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store", body: blob });
        expect(new Headers(init?.headers).get("Authorization")).toBe("private-token");
    });

    it("lists owner assets and refuses to issue unauthenticated requests", async () => {
        const fetcher = vi.fn<Fetcher>(() => Promise.resolve(json({ items: [view] })));
        await expect(
            new TeapotTilesetApi("https://play.example.test/", () => "token", fetcher).list(),
        ).resolves.toEqual([view]);

        const anonymousFetcher = vi.fn<Fetcher>();
        await expect(
            new TeapotTilesetApi("https://play.example.test/", () => null, anonymousFetcher).list(),
        ).rejects.toThrow("Sign in before managing tilesets");
        expect(anonymousFetcher).not.toHaveBeenCalled();
    });
});
