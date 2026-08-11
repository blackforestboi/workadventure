import { describe, expect, it, vi } from "vitest";

import { HostedAgentConnectionApi } from "../../../src/front/Services/HostedAgentConnectionApi";

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function json(payload: unknown): Response {
    return new Response(JSON.stringify(payload), { headers: { "Content-Type": "application/json" } });
}

function href(input: RequestInfo | URL): string {
    return typeof input === "string" ? input : input instanceof Request ? input.url : input.href;
}

describe("HostedAgentConnectionApi", () => {
    it("uses authenticated Pusher OAuth routes without exposing provider credentials", async () => {
        const fetcher = vi
            .fn<Fetcher>()
            .mockResolvedValueOnce(
                json({
                    pairingId: "pairing-1",
                    authorizationUrl: "https://provider.example/authorize",
                    mode: "authorization-code",
                }),
            )
            .mockResolvedValueOnce(json({ state: "pending" }))
            .mockResolvedValueOnce(json({ state: "connected" }))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const api = new HostedAgentConnectionApi("https://play.example.test/", () => "workadventure-jwt", fetcher);

        const start = await api.start("claude");
        const pending = await api.status("claude", start.pairingId);
        const connected = await api.complete("claude", start.pairingId, "oauth-code");
        await api.disconnect("claude");

        expect(start).toEqual({
            pairingId: "pairing-1",
            authorizationUrl: "https://provider.example/authorize",
            mode: "authorization-code",
        });
        expect(pending).toEqual({ state: "pending" });
        expect(connected).toEqual({ state: "connected" });
        expect(fetcher.mock.calls.map(([url]) => new URL(href(url)).pathname)).toEqual([
            "/teapot/ai/providers/claude/oauth/start",
            "/teapot/ai/providers/claude/oauth/status",
            "/teapot/ai/providers/claude/oauth/complete",
            "/teapot/ai/providers/claude/connection",
        ]);
        expect(new URL(href(fetcher.mock.calls[1][0])).searchParams.get("pairingId")).toBe("pairing-1");
        expect(fetcher.mock.calls[2][1]?.body).toBe(JSON.stringify({ pairingId: "pairing-1", code: "oauth-code" }));
        for (const [, init] of fetcher.mock.calls) {
            expect(new Headers(init?.headers).get("Authorization")).toBe("workadventure-jwt");
            expect(init?.credentials).toBe("include");
            expect(init?.cache).toBe("no-store");
        }
        expect(JSON.stringify({ start, pending, connected })).not.toContain("workadventure-jwt");
    });

    it("rejects unauthenticated requests before calling Pusher", async () => {
        const fetcher = vi.fn<Fetcher>();
        const api = new HostedAgentConnectionApi("https://play.example.test/", () => null, fetcher);

        await expect(api.start("codex")).rejects.toThrow("Sign in");
        expect(fetcher).not.toHaveBeenCalled();
    });

    it("reads the existing hosted connection before starting a new authorization", async () => {
        const fetcher = vi.fn<Fetcher>().mockResolvedValue(json({ connected: true }));
        const api = new HostedAgentConnectionApi("https://play.example.test/", () => "workadventure-jwt", fetcher);

        await expect(api.connection("codex")).resolves.toBe(true);
        expect(new URL(href(fetcher.mock.calls[0]?.[0] as RequestInfo | URL)).pathname).toBe(
            "/teapot/ai/providers/codex/connection",
        );
    });
});
