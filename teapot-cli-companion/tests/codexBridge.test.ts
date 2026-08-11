import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CodexBridge,
  type CodexBridgeOptions,
} from "../src/codexBridge.js";
import type {
  CodexAppServerConnection,
  CodexLoginCompleted,
  CodexModel,
} from "../src/codexAppServer.js";
import type { CliProvider } from "../src/types.js";

describe("owner-scoped Codex bridge", () => {
  const tempDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirectories.map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    );
    tempDirectories.length = 0;
  });

  it("isolates pairing state and CODEX_HOME for every opaque owner", async () => {
    const authRoot = await mkdtemp(join(tmpdir(), "teapot-codex-bridge-"));
    tempDirectories.push(authRoot);
    const connections = new Map<string, FakeConnection>();
    const providerHomes: string[] = [];
    const bridge = new CodexBridge({
      authRoot,
      connectionFactory: async (codexHome) => {
        const connection = new FakeConnection();
        connections.set(codexHome, connection);
        return connection;
      },
      imageProviderFactory: (codexHome) => {
        providerHomes.push(codexHome);
        return fakeImageProvider();
      },
    });

    const started = await bridge.startOAuth("owner/alice@example.test");
    expect(started).toEqual({
      pairingId: "login-1",
      verificationUrl: "https://auth.example/device",
      userCode: "ABCD-EFGH",
    });
    const [aliceHome] = [...connections.keys()];
    expect(aliceHome).toMatch(new RegExp(`^${escapeRegExp(authRoot)}/[a-f0-9]{64}$`));
    expect(aliceHome).not.toContain("alice");

    await expect(
      bridge.oauthStatus("owner/bob@example.test", started.pairingId),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(connections.size).toBe(2);

    connections.get(aliceHome)?.complete("login-1", true);
    await expect(
      bridge.oauthStatus("owner/alice@example.test", started.pairingId),
    ).resolves.toEqual({
      pairingId: "login-1",
      state: "connected",
      connected: true,
    });
    await expect(bridge.models("owner/alice@example.test")).resolves.toHaveLength(
      1,
    );
    await expect(
      bridge.generate(
        "owner/alice@example.test",
        {
          provider: "codex",
          prompt: "A tree",
          target: "map-object",
        },
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      provenance: { transport: "hosted-codex-bridge" },
    });
    expect(providerHomes).toEqual([aliceHome]);

    await bridge.disconnect("owner/alice@example.test");
    expect(connections.get(aliceHome)?.closed).toBe(true);
    await bridge.close();
  });

  it("never exposes upstream login errors in status payloads", async () => {
    const { bridge, connection } = await createBridgeFixture(tempDirectories);
    const started = await bridge.startOAuth("owner-1");
    connection.complete(started.pairingId, false, "secret upstream response");

    await expect(
      bridge.oauthStatus("owner-1", started.pairingId),
    ).resolves.toEqual({
      pairingId: started.pairingId,
      state: "failed",
      connected: false,
      error: "Codex authorization failed",
    });
    await bridge.close();
  });
});

class FakeConnection implements CodexAppServerConnection {
  public connected = false;
  public closed = false;
  private readonly listeners = new Set<
    (event: CodexLoginCompleted) => void
  >();

  public async readAccount() {
    return this.connected
      ? ({ connected: true, accountType: "chatgpt" } as const)
      : ({ connected: false } as const);
  }

  public async startDeviceCodeLogin() {
    return {
      loginId: "login-1",
      verificationUrl: "https://auth.example/device",
      userCode: "ABCD-EFGH",
    };
  }

  public async logout(): Promise<void> {
    this.connected = false;
  }

  public async listModels(): Promise<CodexModel[]> {
    return [
      {
        id: "gpt-test",
        model: "gpt-test",
        displayName: "GPT Test",
        description: "Fixture",
        inputModalities: ["text", "image"],
        isDefault: true,
      },
    ];
  }

  public onLoginCompleted(
    listener: (event: CodexLoginCompleted) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async close(): Promise<void> {
    this.closed = true;
  }

  public complete(
    loginId: string,
    success: boolean,
    error: string | null = null,
  ): void {
    this.connected = success;
    for (const listener of this.listeners) {
      listener({ loginId, success, error });
    }
  }
}

function fakeImageProvider(): CliProvider {
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

async function createBridgeFixture(tempDirectories: string[]): Promise<{
  bridge: CodexBridge;
  connection: FakeConnection;
}> {
  const authRoot = await mkdtemp(join(tmpdir(), "teapot-codex-bridge-"));
  tempDirectories.push(authRoot);
  const connection = new FakeConnection();
  const options: CodexBridgeOptions = {
    authRoot,
    connectionFactory: async () => connection,
    imageProviderFactory: () => fakeImageProvider(),
  };
  return { bridge: new CodexBridge(options), connection };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
