import { describe, expect, it, vi } from "vitest";

import { TeapotWokaApi } from "../../../src/front/Services/TeapotWokaApi";

type WokaFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const view = {
    id: "teapot-woka:asset-1",
    name: "Moss hat",
    url: "https://play.example.test/teapot/woka-assets/asset-1.png",
    category: "hat" as const,
    active: true,
    createdAt: "2026-08-09T12:00:00.000Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("TeapotWokaApi", () => {
    it("uploads a PNG to a category without exposing the token in its URL", async () => {
        const fetcher = vi.fn<WokaFetcher>(() => Promise.resolve(jsonResponse(view, 201)));
        const api = new TeapotWokaApi("https://play.example.test/", () => "private-token", fetcher);
        const blob = new Blob(["png"], { type: "image/png" });

        await expect(api.upload(blob, "Moss hat", "hat")).resolves.toEqual(view);

        const [url, init] = fetcher.mock.calls[0];
        expect(init).toBeDefined();
        if (init === undefined) throw new Error("Expected request options");
        const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        expect(requestUrl).toBe("https://play.example.test/teapot/wokas?name=Moss+hat&category=hat");
        expect(requestUrl).not.toContain("private-token");
        expect(init).toMatchObject({
            method: "POST",
            credentials: "include",
            cache: "no-store",
            body: blob,
        });
        const headers = new Headers(init.headers);
        expect(headers.get("Authorization")).toBe("private-token");
        expect(headers.get("Content-Type")).toBe("image/png");
    });

    it("selects only after a successful authenticated response and surfaces server errors", async () => {
        const fetcher = vi
            .fn<WokaFetcher>()
            .mockResolvedValueOnce(jsonResponse(view))
            .mockResolvedValueOnce(jsonResponse({ error: "This Woka belongs to somebody else" }, 403));
        const api = new TeapotWokaApi("https://play.example.test/", () => "private-token", fetcher);

        await expect(api.select(view.id)).resolves.toEqual(view);
        await expect(api.select("teapot-woka:other")).rejects.toThrow("This Woka belongs to somebody else");
    });

    it("requires an authenticated session before issuing a request", async () => {
        const fetcher = vi.fn<WokaFetcher>();
        const api = new TeapotWokaApi("https://play.example.test/", () => null, fetcher);

        await expect(api.list()).rejects.toThrow("Sign in before managing generated avatar assets");
        expect(fetcher).not.toHaveBeenCalled();
    });
});
