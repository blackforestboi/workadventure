import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { CliProvider } from "../src/types.js";
import { createCompanionServer } from "../src/server.js";

const origin = "https://teapot.test";
const token = "test-token";

describe("CLI companion server", () => {
  const servers: ReturnType<typeof createCompanionServer>[] = [];
  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
    servers.length = 0;
  });

  it("requires both an allowlisted origin and the session token", async () => {
    const provider = fakeProvider();
    const server = createCompanionServer({
      allowedOrigins: new Set([origin]),
      token,
      providers: new Map([["codex", provider]]),
    });
    servers.push(server);
    await listen(server);
    const url = baseUrl(server);

    expect((await fetch(`${url}/v1/capabilities`)).status).toBe(403);
    expect(
      (await fetch(`${url}/v1/capabilities`, { headers: { Origin: origin } }))
        .status,
    ).toBe(401);
    expect(
      (
        await fetch(`${url}/v1/capabilities`, {
          headers: { Origin: origin, Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(200);
  });

  it("does not expose provider errors or credentials", async () => {
    const provider = fakeProvider();
    vi.mocked(provider.generate).mockRejectedValueOnce(
      new Error("secret-token provider stack"),
    );
    const server = createCompanionServer({
      allowedOrigins: new Set([origin]),
      token,
      providers: new Map([["codex", provider]]),
    });
    servers.push(server);
    await listen(server);
    const response = await fetch(`${baseUrl(server)}/v1/generate`, {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        provider: "codex",
        prompt: "tree",
        target: "map-object",
      }),
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-token");
  });

  it("serves a one-click pairing page only for an allowlisted Teapot origin", async () => {
    const server = createCompanionServer({
      allowedOrigins: new Set([origin]),
      token,
      providers: new Map([["codex", fakeProvider()]]),
    });
    servers.push(server);
    await listen(server);
    const url = baseUrl(server);

    const response = await fetch(
      `${url}/connect?origin=${encodeURIComponent(origin)}&provider=codex&requestId=pairing-request-123`,
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain("teapot.cli-companion.connected");
    expect(html).toContain("pairing-request-123");
    expect(html).toContain(token);

    expect(
      (
        await fetch(
          `${url}/connect?origin=${encodeURIComponent("https://attacker.example")}&provider=codex&requestId=pairing-request-123`,
        )
      ).status,
    ).toBe(403);
  });
});

function fakeProvider(): CliProvider {
  return {
    capabilities: vi.fn().mockResolvedValue({
      provider: "codex",
      installed: true,
      imageGeneration: "available",
    }),
    generate: vi.fn().mockResolvedValue({
      provider: "codex",
      mimeType: "image/png",
      base64: "iVBORw0KGgo=",
      provenance: { transport: "local-cli" },
    }),
  };
}

async function listen(
  server: ReturnType<typeof createCompanionServer>,
): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
}

function baseUrl(server: ReturnType<typeof createCompanionServer>): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}
