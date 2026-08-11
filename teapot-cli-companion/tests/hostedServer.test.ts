import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { CodexBridgeService } from "../src/codexBridge.js";
import { createHostedBridgeServer } from "../src/hostedServer.js";

const serviceSecret = "test-service-secret-with-at-least-32-characters";
const owner = "opaque-owner-123";

describe("hosted Codex bridge HTTP contract", () => {
  const servers: ReturnType<typeof createHostedBridgeServer>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
    servers.length = 0;
  });

  it("requires both the service secret and an opaque owner", async () => {
    const bridge = fakeBridge();
    const { server, url } = await startServer(bridge);
    servers.push(server);

    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect(
      (await fetch(`${url}/v1/providers/codex/capabilities`)).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${url}/v1/providers/codex/capabilities`, {
          headers: { Authorization: `Bearer ${serviceSecret}` },
        })
      ).status,
    ).toBe(401);
    expect(bridge.capabilities).not.toHaveBeenCalled();
  });

  it("routes device-code OAuth, models, generation, and disconnect by owner", async () => {
    const bridge = fakeBridge();
    const { server, url } = await startServer(bridge);
    servers.push(server);
    const headers = authenticatedHeaders();

    const started = await fetch(`${url}/v1/oauth/codex/start`, {
      method: "POST",
      headers,
    });
    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({
      pairingId: "pairing-1",
      verificationUrl: "https://auth.example/device",
      userCode: "ABCD-EFGH",
    });
    expect(bridge.startOAuth).toHaveBeenCalledWith(owner);

    const status = await fetch(
      `${url}/v1/oauth/codex/status?pairingId=pairing-1`,
      { headers },
    );
    expect(status.status).toBe(200);
    expect(bridge.oauthStatus).toHaveBeenCalledWith(owner, "pairing-1");

    const models = await fetch(`${url}/v1/providers/codex/models`, {
      headers,
    });
    expect(models.status).toBe(200);
    expect(await models.json()).toMatchObject({ provider: "codex" });
    expect(bridge.models).toHaveBeenCalledWith(owner);

    const generated = await fetch(`${url}/v1/providers/codex/generate`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "A transparent tree",
        target: "map-object",
      }),
    });
    expect(generated.status).toBe(200);
    expect(bridge.generate).toHaveBeenCalledWith(
      owner,
      expect.objectContaining({
        provider: "codex",
        prompt: "A transparent tree",
      }),
      expect.any(AbortSignal),
    );

    const disconnected = await fetch(
      `${url}/v1/oauth/codex/connection`,
      { method: "DELETE", headers },
    );
    expect(disconnected.status).toBe(204);
    expect(bridge.disconnect).toHaveBeenCalledWith(owner);
  });

  it("keeps device codes out of the bridge completion endpoint", async () => {
    const bridge = fakeBridge();
    const { server, url } = await startServer(bridge);
    servers.push(server);
    const response = await fetch(`${url}/v1/oauth/codex/complete`, {
      method: "POST",
      headers: {
        ...authenticatedHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ pairingId: "pairing-1", userCode: "secret" }),
    });

    expect(response.status).toBe(400);
    expect(bridge.oauthStatus).not.toHaveBeenCalled();
  });
});

function fakeBridge(): CodexBridgeService {
  return {
    startOAuth: vi.fn().mockResolvedValue({
      pairingId: "pairing-1",
      verificationUrl: "https://auth.example/device",
      userCode: "ABCD-EFGH",
    }),
    oauthStatus: vi.fn().mockResolvedValue({
      pairingId: "pairing-1",
      state: "pending",
      connected: false,
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    capabilities: vi.fn().mockResolvedValue({
      provider: "codex",
      connected: true,
      deviceCodeLogin: true,
      modelSelection: true,
      imageGeneration: "available",
      generationTransport: "codex-agent-tool",
    }),
    models: vi.fn().mockResolvedValue([]),
    generate: vi.fn().mockResolvedValue({
      provider: "codex",
      mimeType: "image/png",
      base64: "iVBORw0KGgo=",
      provenance: { transport: "hosted-codex-bridge" },
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

async function startServer(bridge: CodexBridgeService): Promise<{
  server: ReturnType<typeof createHostedBridgeServer>;
  url: string;
}> {
  const server = createHostedBridgeServer({ serviceSecret, codex: bridge });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

function authenticatedHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${serviceSecret}`,
    "X-Teapot-Owner": owner,
  };
}
