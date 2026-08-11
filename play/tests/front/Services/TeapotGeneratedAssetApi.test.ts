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

describe("TeapotGeneratedAssetApi", () => {
    it("accepts a validated SHA-256 fingerprint in upload and list views", async () => {
        const fetcher = vi
            .fn<Fetcher>()
            .mockResolvedValueOnce(json(view, 201))
            .mockResolvedValueOnce(json({ items: [view] }));
        const api = new TeapotGeneratedAssetApi("https://play.example.test/", () => "private-token", fetcher);

        await expect(
            api.upload(new Blob(["png"], { type: "image/png" }), "Forest shrine", "map-entity", {
                source: "generated",
            }),
        ).resolves.toEqual(view);
        await expect(api.list("map-entity")).resolves.toEqual([view]);
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
});
