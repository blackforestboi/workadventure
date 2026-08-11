import { describe, expect, it, vi } from "vitest";

import { TeapotMcpBrowserApi } from "../../../src/front/Services/TeapotMcpBrowserApi";

type McpFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("TeapotMcpBrowserApi paid generation", () => {
    it("claims before completion without putting the approval token in the URL", async () => {
        const fetcher = vi
            .fn<McpFetcher>()
            .mockResolvedValueOnce(jsonResponse({ approvalId: "00000000-0000-4000-8000-000000000010" }))
            .mockResolvedValueOnce(jsonResponse({ id: "proposal-1", state: "applied" }));
        const api = new TeapotMcpBrowserApi("https://play.example.test/", () => "browser-jwt", fetcher);
        const approvalToken = "one-time-approval-token-that-must-stay-in-the-body";

        await api.claimPaidGeneration("00000000-0000-4000-8000-000000000001", approvalToken);
        await api.completePaidGeneration("00000000-0000-4000-8000-000000000001", approvalToken, {
            status: "accepted-asset",
            assetId: "asset_123",
            assetUrl: "https://play.example.test/teapot/woka-assets/asset_123.png",
            assetKind: "woka",
            providerId: "openrouter",
            modelId: "image-model",
            mediaType: "image/png",
            byteLength: 4_096,
        });

        for (const [url, init] of fetcher.mock.calls) {
            const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
            expect(requestUrl).not.toContain(approvalToken);
            expect(new Headers(init?.headers).get("Authorization")).toBe("browser-jwt");
            expect(typeof init?.body === "string" ? init.body : "").toContain(approvalToken);
        }
        const requestUrls = fetcher.mock.calls.map(([url]) =>
            typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
        );
        expect(requestUrls[0]).toContain("claim-paid-generation");
        expect(requestUrls[1]).toContain("complete-paid-generation");
    });
});
