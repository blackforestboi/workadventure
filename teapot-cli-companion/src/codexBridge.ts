import { createHash } from "node:crypto";
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  codexProcessEnvironment,
  StdioCodexAppServerConnection,
  type CodexAppServerConnection,
  type CodexLoginCompleted,
  type CodexModel,
} from "./codexAppServer.js";
import { CodexCliProvider } from "./providers/CodexCliProvider.js";
import { CompanionRequestError } from "./security.js";
import type {
  CliGenerateRequest,
  CliGenerateResult,
  CliProvider,
} from "./types.js";

const PAIRING_RETENTION_MS = 60 * 60 * 1_000;
const MAX_PARALLEL_GENERATIONS_PER_OWNER = 12;

export interface CodexOAuthStart {
  pairingId: string;
  verificationUrl: string;
  userCode: string;
}

export type CodexOAuthState = "pending" | "connected" | "failed";

export interface CodexOAuthStatus {
  pairingId: string;
  state: CodexOAuthState;
  connected: boolean;
  error?: string;
}

export interface CodexBridgeCapabilities {
  provider: "codex";
  connected: boolean;
  deviceCodeLogin: true;
  modelSelection: true;
  imageGeneration: "available" | "unavailable";
  generationTransport: "codex-agent-tool";
}

export interface CodexBridgeService {
  startOAuth(owner: string): Promise<CodexOAuthStart>;
  oauthStatus(owner: string, pairingId: string): Promise<CodexOAuthStatus>;
  disconnect(owner: string): Promise<void>;
  capabilities(owner: string): Promise<CodexBridgeCapabilities>;
  models(owner: string): Promise<CodexModel[]>;
  generate(
    owner: string,
    request: CliGenerateRequest,
    signal: AbortSignal,
  ): Promise<CliGenerateResult>;
  close(): Promise<void>;
}

interface PairingRecord {
  state: CodexOAuthState;
  createdAt: number;
}

type ConnectionFactory = (
  codexHome: string,
) => Promise<CodexAppServerConnection>;
type ImageProviderFactory = (codexHome: string) => CliProvider;

export interface CodexBridgeOptions {
  authRoot: string;
  executable?: string;
  connectionFactory?: ConnectionFactory;
  imageProviderFactory?: ImageProviderFactory;
}

/**
 * Owns one isolated Codex account directory and app-server process per Teapot
 * owner. The opaque owner is hashed before it touches the filesystem.
 */
export class CodexBridge implements CodexBridgeService {
  private readonly authRoot: string;
  private readonly executable: string;
  private readonly connectionFactory: ConnectionFactory;
  private readonly imageProviderFactory: ImageProviderFactory;
  private readonly connections = new Map<
    string,
    Promise<CodexAppServerConnection>
  >();
  private readonly pairings = new Map<string, Map<string, PairingRecord>>();
  private readonly activeGenerations = new Map<string, number>();

  public constructor(options: CodexBridgeOptions) {
    this.authRoot = options.authRoot;
    this.executable = options.executable ?? "codex";
    this.connectionFactory =
      options.connectionFactory ??
      ((codexHome) =>
        StdioCodexAppServerConnection.create({
          codexHome,
          executable: this.executable,
        }));
    this.imageProviderFactory =
      options.imageProviderFactory ??
      ((codexHome) =>
        new CodexCliProvider(
          this.executable,
          codexProcessEnvironment(codexHome),
          false,
        ));
  }

  public async startOAuth(owner: string): Promise<CodexOAuthStart> {
    this.prunePairings(owner);
    const connection = await this.connection(owner);
    if ((await connection.readAccount()).connected) {
      throw new CompanionRequestError(
        "Codex account is already connected",
        409,
      );
    }
    const login = await connection.startDeviceCodeLogin();
    this.ownerPairings(owner).set(login.loginId, {
      state: "pending",
      createdAt: Date.now(),
    });
    return {
      pairingId: login.loginId,
      verificationUrl: login.verificationUrl,
      userCode: login.userCode,
    };
  }

  public async oauthStatus(
    owner: string,
    pairingId: string,
  ): Promise<CodexOAuthStatus> {
    this.prunePairings(owner);
    const connection = await this.connection(owner);
    let record = this.pairings.get(owner)?.get(pairingId);
    const account = await connection.readAccount();
    if (account.connected) {
      record ??= { state: "connected", createdAt: Date.now() };
      record.state = "connected";
      this.ownerPairings(owner).set(pairingId, record);
    }
    if (!record) {
      throw new CompanionRequestError("Codex pairing was not found", 404);
    }
    return publicPairingStatus(pairingId, record);
  }

  public async disconnect(owner: string): Promise<void> {
    const connection = await this.connection(owner);
    await connection.logout();
    await connection.close();
    this.connections.delete(owner);
    this.pairings.delete(owner);
    this.activeGenerations.delete(owner);
  }

  public async capabilities(owner: string): Promise<CodexBridgeCapabilities> {
    const connected = (await (await this.connection(owner)).readAccount())
      .connected;
    return {
      provider: "codex",
      connected,
      deviceCodeLogin: true,
      modelSelection: true,
      imageGeneration: connected ? "available" : "unavailable",
      generationTransport: "codex-agent-tool",
    };
  }

  public async models(owner: string): Promise<CodexModel[]> {
    const connection = await this.requireConnected(owner);
    return connection.listModels();
  }

  public async generate(
    owner: string,
    request: CliGenerateRequest,
    signal: AbortSignal,
  ): Promise<CliGenerateResult> {
    await this.requireConnected(owner);
    const activeCount = this.activeGenerations.get(owner) ?? 0;
    if (activeCount >= MAX_PARALLEL_GENERATIONS_PER_OWNER) {
      throw new CompanionRequestError(
        "The parallel Codex generation limit was reached for this account",
        429,
      );
    }
    this.activeGenerations.set(owner, activeCount + 1);
    try {
      const result = await this.imageProviderFactory(
        this.codexHome(owner),
      ).generate(request, signal);
      return {
        ...result,
        provenance: {
          ...result.provenance,
          transport: "hosted-codex-bridge",
        },
      };
    } finally {
      const remaining = (this.activeGenerations.get(owner) ?? 1) - 1;
      if (remaining <= 0) this.activeGenerations.delete(owner);
      else this.activeGenerations.set(owner, remaining);
    }
  }

  public async close(): Promise<void> {
    const connections = [...this.connections.values()];
    this.connections.clear();
    this.pairings.clear();
    this.activeGenerations.clear();
    await Promise.allSettled(
      connections.map(async (connection) => (await connection).close()),
    );
  }

  private async requireConnected(
    owner: string,
  ): Promise<CodexAppServerConnection> {
    const connection = await this.connection(owner);
    if (!(await connection.readAccount()).connected) {
      throw new CompanionRequestError("Codex account is not connected", 409);
    }
    return connection;
  }

  private connection(owner: string): Promise<CodexAppServerConnection> {
    const existing = this.connections.get(owner);
    if (existing) return existing;
    const creating = this.createConnection(owner);
    this.connections.set(owner, creating);
    creating.catch(() => {
      if (this.connections.get(owner) === creating) {
        this.connections.delete(owner);
      }
    });
    return creating;
  }

  private async createConnection(
    owner: string,
  ): Promise<CodexAppServerConnection> {
    await mkdir(this.authRoot, { recursive: true, mode: 0o700 });
    await chmod(this.authRoot, 0o700);
    const codexHome = this.codexHome(owner);
    await mkdir(codexHome, { recursive: true, mode: 0o700 });
    await chmod(codexHome, 0o700);
    const connection = await this.connectionFactory(codexHome);
    connection.onLoginCompleted((event) =>
      this.handleLoginCompleted(owner, event),
    );
    return connection;
  }

  private handleLoginCompleted(
    owner: string,
    event: CodexLoginCompleted,
  ): void {
    if (!event.loginId) return;
    const record = this.pairings.get(owner)?.get(event.loginId);
    if (!record) return;
    record.state = event.success ? "connected" : "failed";
  }

  private ownerPairings(owner: string): Map<string, PairingRecord> {
    const existing = this.pairings.get(owner);
    if (existing) return existing;
    const created = new Map<string, PairingRecord>();
    this.pairings.set(owner, created);
    return created;
  }

  private prunePairings(owner: string): void {
    const records = this.pairings.get(owner);
    if (!records) return;
    const cutoff = Date.now() - PAIRING_RETENTION_MS;
    for (const [pairingId, record] of records) {
      if (record.createdAt < cutoff) records.delete(pairingId);
    }
    if (records.size === 0) this.pairings.delete(owner);
  }

  private codexHome(owner: string): string {
    const ownerHash = createHash("sha256")
      .update("teapot-codex-owner\0")
      .update(owner)
      .digest("hex");
    return join(this.authRoot, ownerHash);
  }
}

function publicPairingStatus(
  pairingId: string,
  record: PairingRecord,
): CodexOAuthStatus {
  if (record.state === "failed") {
    return {
      pairingId,
      state: "failed",
      connected: false,
      error: "Codex authorization failed",
    };
  }
  return {
    pairingId,
    state: record.state,
    connected: record.state === "connected",
  };
}
