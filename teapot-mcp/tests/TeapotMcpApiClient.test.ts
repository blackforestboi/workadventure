import { describe, expect, it, vi } from "vitest";

import { TeapotMcpApiClient } from "../src/TeapotMcpApiClient.js";

describe("TeapotMcpApiClient", () => {
  it("keeps the bearer token in the Authorization header and out of the URL", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: "00000000-0000-4000-8000-000000000001",
          ownerId: "00000000-0000-4000-8000-000000000002",
          clientName: "Codex",
          expiresAt: "2026-08-09T12:00:00.000Z",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new TeapotMcpApiClient({
      pusherUrl: "https://play.example.test/",
      bearerToken: "secret-session-token-that-never-enters-the-url",
      fetch: request,
    });

    await client.authenticate();

    const calledUrl = request.mock.calls[0]?.[0];
    const calledInit = request.mock.calls[0]?.[1];
    expect(String(calledUrl)).not.toContain("secret-session-token");
    expect(new Headers(calledInit?.headers).get("Authorization")).toBe(
      "Bearer secret-session-token-that-never-enters-the-url",
    );
  });

  it("encodes terrain catalog filters as bounded MCP query parameters", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, available: 300 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new TeapotMcpApiClient({
      pusherUrl: "https://play.example.test/",
      bearerToken: "secret-session-token",
      fetch: request,
    });

    await client.terrainCatalog({
      query: "icy river",
      terrainType: "water",
      solid: true,
      limit: 25,
    });

    expect(String(request.mock.calls[0]?.[0])).toBe(
      "https://play.example.test/teapot/mcp/terrain-catalog?query=icy+river&terrainType=water&solid=true&limit=25",
    );
  });

  it("encodes full atlas asset catalog filters for structure discovery", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, available: 960 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new TeapotMcpApiClient({
      pusherUrl: "https://play.example.test/",
      bearerToken: "secret-session-token",
      fetch: request,
    });

    await client.assetCatalog({
      query: "wooden bridge",
      kind: "structure",
      solid: true,
      limit: 10,
    });

    expect(String(request.mock.calls[0]?.[0])).toBe(
      "https://play.example.test/teapot/mcp/asset-catalog?query=wooden+bridge&kind=structure&solid=true&limit=10",
    );
  });
});
