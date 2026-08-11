import { randomUUID, createHash } from "node:crypto";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { runProcess } from "./processRunner.js";
import { ClaudeCliProvider } from "./providers/ClaudeCliProvider.js";
import { CompanionRequestError } from "./security.js";
import type { CliGenerateRequest, CliGenerateResult } from "./types.js";

const PAIRING_TTL_MS = 10 * 60 * 1_000;
const AUTH_START_TIMEOUT_MS = 30_000;
const MAX_AUTH_OUTPUT = 64 * 1024;

export interface ClaudeOAuthStart {
  pairingId: string;
  authorizationUrl: string;
  mode: "authorization-code";
  expiresAt: string;
}

export interface ClaudeOAuthStatus {
  state: "pending" | "connected" | "failed" | "expired";
  message?: string;
}

interface PairingRecord {
  owner: string;
  child: ChildProcessWithoutNullStreams;
  authorizationUrl: string;
  createdAt: number;
  state: "pending" | "failed";
}

export interface ClaudeBridgeOptions {
  authRoot: string;
  executable?: string;
  imageTool?: string;
}

export class ClaudeBridge {
  private readonly executable: string;
  private readonly pairings = new Map<string, PairingRecord>();
  private readonly activeGenerations = new Set<string>();

  public constructor(private readonly options: ClaudeBridgeOptions) {
    this.executable = options.executable ?? "claude";
  }

  public async startOAuth(owner: string): Promise<ClaudeOAuthStart> {
    if (await this.isConnected(owner)) {
      throw new CompanionRequestError("Claude account is already connected", 409);
    }
    this.removeOwnerPairings(owner);
    const authDir = await this.ensureOwnerDirectory(owner);
    const child = spawn(this.executable, ["auth", "login", "--claudeai"], {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
      env: claudeProcessEnvironment(authDir),
    });
    const authorizationUrl = await waitForAuthorizationUrl(child);
    const pairingId = randomUUID();
    const createdAt = Date.now();
    const record: PairingRecord = {
      owner,
      child,
      authorizationUrl,
      createdAt,
      state: "pending",
    };
    this.pairings.set(pairingId, record);
    child.once("close", () => {
      if (this.pairings.get(pairingId) === record && record.state === "pending") {
        record.state = "failed";
      }
    });
    child.once("error", () => {
      if (this.pairings.get(pairingId) === record) record.state = "failed";
    });
    return {
      pairingId,
      authorizationUrl,
      mode: "authorization-code",
      expiresAt: new Date(createdAt + PAIRING_TTL_MS).toISOString(),
    };
  }

  public async completeOAuth(owner: string, pairingId: string, code: string): Promise<ClaudeOAuthStatus> {
    const record = this.requirePairing(owner, pairingId);
    if (record.state !== "pending" || record.child.stdin.destroyed) {
      return this.oauthStatus(owner, pairingId);
    }
    record.child.stdin.write(`${code.trim()}\n`);
    return this.oauthStatus(owner, pairingId);
  }

  public async oauthStatus(owner: string, pairingId: string): Promise<ClaudeOAuthStatus> {
    const record = this.requirePairing(owner, pairingId);
    if (Date.now() - record.createdAt > PAIRING_TTL_MS) {
      stopChild(record.child);
      this.pairings.delete(pairingId);
      return { state: "expired", message: "Claude authorization expired" };
    }
    if (await this.isConnected(owner)) {
      this.pairings.delete(pairingId);
      return { state: "connected" };
    }
    if (record.state === "failed") {
      return { state: "failed", message: "Claude authorization did not complete" };
    }
    return { state: "pending" };
  }

  public async disconnect(owner: string): Promise<void> {
    this.removeOwnerPairings(owner);
    const result = await runProcess(this.executable, ["auth", "logout"], {
      timeoutMs: 15_000,
      env: claudeProcessEnvironment(await this.ensureOwnerDirectory(owner)),
      inheritEnv: false,
    });
    if (result.exitCode !== 0 && (await this.isConnected(owner))) {
      throw new CompanionRequestError("Claude account could not be disconnected", 502);
    }
  }

  public async models(owner: string): Promise<Array<{ id: string; name: string; description: string }>> {
    await this.requireConnected(owner);
    return [
      { id: "sonnet", name: "Claude Sonnet", description: "Balanced Claude subscription model" },
      { id: "opus", name: "Claude Opus", description: "Highest-capability Claude subscription model" },
      { id: "haiku", name: "Claude Haiku", description: "Fast Claude subscription model" },
    ];
  }

  public async generate(owner: string, request: CliGenerateRequest, signal: AbortSignal): Promise<CliGenerateResult> {
    await this.requireConnected(owner);
    if (this.activeGenerations.has(owner)) {
      throw new CompanionRequestError("A Claude generation is already running for this account", 429);
    }
    this.activeGenerations.add(owner);
    try {
      const authDir = await this.ensureOwnerDirectory(owner);
      const provider = new ClaudeCliProvider(
        this.executable,
        this.options.imageTool,
        claudeProcessEnvironment(authDir),
        false,
      );
      const result = await provider.generate(request, signal);
      return { ...result, provenance: { ...result.provenance, transport: "hosted-claude-bridge" } };
    } finally {
      this.activeGenerations.delete(owner);
    }
  }

  public close(): void {
    for (const record of this.pairings.values()) stopChild(record.child);
    this.pairings.clear();
    this.activeGenerations.clear();
  }

  private async requireConnected(owner: string): Promise<void> {
    if (!(await this.isConnected(owner))) {
      throw new CompanionRequestError("Claude account is not connected", 409);
    }
  }

  private async isConnected(owner: string): Promise<boolean> {
    const result = await runProcess(this.executable, ["auth", "status", "--json"], {
      timeoutMs: 15_000,
      env: claudeProcessEnvironment(await this.ensureOwnerDirectory(owner)),
      inheritEnv: false,
    });
    try {
      const payload = JSON.parse(result.stdout) as { loggedIn?: unknown };
      return payload.loggedIn === true;
    } catch {
      return false;
    }
  }

  private requirePairing(owner: string, pairingId: string): PairingRecord {
    const record = this.pairings.get(pairingId);
    if (!record || record.owner !== owner) {
      throw new CompanionRequestError("Claude pairing was not found", 404);
    }
    return record;
  }

  private removeOwnerPairings(owner: string): void {
    for (const [pairingId, record] of this.pairings) {
      if (record.owner !== owner) continue;
      stopChild(record.child);
      this.pairings.delete(pairingId);
    }
  }

  private async ensureOwnerDirectory(owner: string): Promise<string> {
    await mkdir(this.options.authRoot, { recursive: true, mode: 0o700 });
    await chmod(this.options.authRoot, 0o700);
    const ownerHash = createHash("sha256").update("teapot-claude-owner\0").update(owner).digest("hex");
    const authDir = join(this.options.authRoot, ownerHash);
    await mkdir(authDir, { recursive: true, mode: 0o700 });
    await chmod(authDir, 0o700);
    return authDir;
  }
}

function claudeProcessEnvironment(authDir: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: authDir,
    CLAUDE_CONFIG_DIR: authDir,
    XDG_CONFIG_HOME: authDir,
    TMPDIR: process.env.TMPDIR ?? "/tmp",
    LANG: process.env.LANG ?? "C.UTF-8",
    NO_COLOR: "1",
    CI: "1",
  };
}

function waitForAuthorizationUrl(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolve, reject) => {
    let captured = "";
    const timer = setTimeout(() => finish(new CompanionRequestError("Claude authorization did not start", 504)), AUTH_START_TIMEOUT_MS);
    const onData = (chunk: Buffer) => {
      if (captured.length < MAX_AUTH_OUTPUT) captured += chunk.toString("utf8").slice(0, MAX_AUTH_OUTPUT - captured.length);
      const match = stripAnsi(captured).match(/https:\/\/[^\s<>"']+/);
      if (!match) return;
      try {
        const parsed = new URL(match[0].replace(/[),.;]+$/, ""));
        if (parsed.protocol !== "https:") return;
        finish(undefined, parsed.toString());
      } catch {
        // Continue collecting until a complete URL is printed.
      }
    };
    const onExit = () => finish(new CompanionRequestError("Claude authorization exited before presenting a URL", 502));
    const onError = () => finish(new CompanionRequestError("Claude CLI could not be started", 503));
    const finish = (error?: Error, url?: string) => {
      clearTimeout(timer);
      child.stdout.removeListener("data", onData);
      child.stderr.removeListener("data", onData);
      child.removeListener("close", onExit);
      child.removeListener("error", onError);
      if (error) reject(error);
      else if (url) resolve(url);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("close", onExit);
    child.once("error", onError);
  });
}

function stripAnsi(value: string): string {
  return value.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "");
}

function stopChild(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode === null && !child.killed) child.kill("SIGTERM");
}
