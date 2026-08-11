import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { chmod, mkdir } from "node:fs/promises";

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_PROTOCOL_BUFFER_BYTES = 8 * 1024 * 1024;

interface JsonRpcResponse {
  id: number;
  result?: unknown;
  error?: unknown;
}

interface JsonRpcNotification {
  method: string;
  params?: unknown;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timeout: NodeJS.Timeout;
}

interface RawAccount {
  type: "apiKey" | "chatgpt" | "amazonBedrock";
  email?: string | null;
  planType?: string;
  usesCodexManagedCredentials?: boolean;
}

interface RawModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  inputModalities: string[];
  isDefault: boolean;
}

interface RawModelListResponse {
  data: RawModel[];
  nextCursor: string | null;
}

export interface CodexAccountStatus {
  connected: boolean;
  accountType?: RawAccount["type"];
  planType?: string;
}

export interface CodexDeviceCodeLogin {
  loginId: string;
  verificationUrl: string;
  userCode: string;
}

export interface CodexLoginCompleted {
  loginId: string | null;
  success: boolean;
  error: string | null;
}

export interface CodexModel {
  id: string;
  model: string;
  displayName: string;
  description: string;
  inputModalities: string[];
  isDefault: boolean;
}

export interface CodexAppServerConnection {
  readAccount(): Promise<CodexAccountStatus>;
  startDeviceCodeLogin(): Promise<CodexDeviceCodeLogin>;
  logout(): Promise<void>;
  listModels(): Promise<CodexModel[]>;
  onLoginCompleted(listener: (event: CodexLoginCompleted) => void): () => void;
  close(): Promise<void>;
}

export interface CodexAppServerConnectionOptions {
  codexHome: string;
  executable?: string;
  requestTimeoutMs?: number;
}

export function codexProcessEnvironment(
  codexHome: string,
): Readonly<NodeJS.ProcessEnv> {
  const environment: NodeJS.ProcessEnv = {
    CODEX_HOME: codexHome,
    NO_COLOR: "1",
  };
  for (const name of [
    "PATH",
    "LANG",
    "LC_ALL",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
  ]) {
    const value = process.env[name];
    if (value !== undefined) environment[name] = value;
  }
  return environment;
}

/**
 * Thin client for the official `codex app-server` newline-delimited JSON-RPC
 * protocol. Each instance receives an isolated CODEX_HOME, so Codex refresh
 * tokens and account metadata never cross Teapot owners or reach the browser.
 */
export class StdioCodexAppServerConnection implements CodexAppServerConnection {
  private readonly executable: string;
  private readonly codexHome: string;
  private readonly requestTimeoutMs: number;
  private readonly events = new EventEmitter();
  private readonly pending = new Map<number, PendingRequest>();
  private child: ChildProcessWithoutNullStreams | undefined;
  private nextRequestId = 1;
  private stdoutBuffer = "";
  private closing = false;

  private constructor(options: CodexAppServerConnectionOptions) {
    this.codexHome = options.codexHome;
    this.executable = options.executable ?? "codex";
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  }

  public static async create(
    options: CodexAppServerConnectionOptions,
  ): Promise<StdioCodexAppServerConnection> {
    const connection = new StdioCodexAppServerConnection(options);
    await connection.start();
    return connection;
  }

  public async readAccount(): Promise<CodexAccountStatus> {
    const result = await this.request<{
      account: RawAccount | null;
      requiresOpenaiAuth: boolean;
    }>("account/read", { refreshToken: false });
    if (!result.account) return { connected: false };
    return {
      connected: true,
      accountType: result.account.type,
      ...(result.account.planType ? { planType: result.account.planType } : {}),
    };
  }

  public async startDeviceCodeLogin(): Promise<CodexDeviceCodeLogin> {
    const result = await this.request<unknown>("account/login/start", {
      type: "chatgptDeviceCode",
    });
    if (!isDeviceCodeLogin(result)) {
      throw new Error("Codex app-server returned an invalid login response");
    }
    return {
      loginId: result.loginId,
      verificationUrl: result.verificationUrl,
      userCode: result.userCode,
    };
  }

  public async logout(): Promise<void> {
    await this.request("account/logout", undefined);
  }

  public async listModels(): Promise<CodexModel[]> {
    const models: CodexModel[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const result: RawModelListResponse =
        await this.request<RawModelListResponse>("model/list", {
          cursor,
          limit: 100,
          includeHidden: false,
        });
      if (!isModelListResponse(result)) {
        throw new Error("Codex app-server returned an invalid model list");
      }
      for (const model of result.data) {
        if (model.hidden) continue;
        models.push({
          id: model.id,
          model: model.model,
          displayName: model.displayName,
          description: model.description,
          inputModalities: model.inputModalities,
          isDefault: model.isDefault,
        });
      }
      cursor = result.nextCursor;
      if (cursor === null) break;
    }
    return models;
  }

  public onLoginCompleted(
    listener: (event: CodexLoginCompleted) => void,
  ): () => void {
    this.events.on("loginCompleted", listener);
    return () => this.events.off("loginCompleted", listener);
  }

  public async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    const child = this.child;
    this.child = undefined;
    this.rejectPending(new Error("Codex app-server connection closed"));
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, 2_000);
      child.once("close", () => {
        clearTimeout(timeout);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }

  private async start(): Promise<void> {
    await mkdir(this.codexHome, { recursive: true, mode: 0o700 });
    await chmod(this.codexHome, 0o700);
    const child = spawn(
      this.executable,
      [
        "app-server",
        "--config",
        'cli_auth_credentials_store="file"',
        "--listen",
        "stdio://",
      ],
      {
        cwd: this.codexHome,
        env: codexProcessEnvironment(this.codexHome),
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    this.child = child;
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => this.handleStdout(chunk));
    // Drain diagnostics without retaining them: upstream errors may contain
    // account details and must not leak into HTTP responses or long-lived logs.
    child.stderr.resume();
    child.once("error", (error) => this.handleProcessExit(error));
    child.once("close", () =>
      this.handleProcessExit(new Error("Codex app-server exited")),
    );
    await this.request("initialize", {
      clientInfo: {
        name: "teapot-maps-bridge",
        title: "Teapot Maps Codex Bridge",
        version: "0.1.0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
      },
    });
  }

  private request<T = unknown>(method: string, params: unknown): Promise<T> {
    const child = this.child;
    if (!child || this.closing || !child.stdin.writable) {
      return Promise.reject(new Error("Codex app-server is not running"));
    }
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex app-server request timed out"));
      }, this.requestTimeoutMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timeout,
      });
      const message =
        params === undefined ? { id, method } : { id, method, params };
      child.stdin.write(`${JSON.stringify(message)}\n`, (error) => {
        if (!error) return;
        const pending = this.pending.get(id);
        if (!pending) return;
        clearTimeout(pending.timeout);
        this.pending.delete(id);
        pending.reject(new Error("Could not write to Codex app-server"));
      });
    });
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    if (Buffer.byteLength(this.stdoutBuffer) > MAX_PROTOCOL_BUFFER_BYTES) {
      this.handleProcessExit(
        new Error("Codex app-server response is too large"),
      );
      this.child?.kill("SIGKILL");
      return;
    }
    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.handleMessage(line);
      newline = this.stdoutBuffer.indexOf("\n");
    }
  }

  private handleMessage(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line) as unknown;
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (typeof (message as { id?: unknown }).id === "number") {
      this.handleResponse(message as JsonRpcResponse);
      return;
    }
    const notification = message as JsonRpcNotification;
    if (
      notification.method === "account/login/completed" &&
      isLoginCompleted(notification.params)
    ) {
      this.events.emit("loginCompleted", notification.params);
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    this.pending.delete(response.id);
    if (response.error !== undefined) {
      pending.reject(new Error("Codex app-server request failed"));
      return;
    }
    pending.resolve(response.result);
  }

  private handleProcessExit(error: Error): void {
    if (!this.child && this.closing) return;
    this.child = undefined;
    this.rejectPending(error);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function isDeviceCodeLogin(value: unknown): value is {
  type: "chatgptDeviceCode";
  loginId: string;
  verificationUrl: string;
  userCode: string;
} {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === "chatgptDeviceCode" &&
    typeof candidate.loginId === "string" &&
    typeof candidate.verificationUrl === "string" &&
    typeof candidate.userCode === "string"
  );
}

function isLoginCompleted(value: unknown): value is CodexLoginCompleted {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.loginId === null || typeof candidate.loginId === "string") &&
    typeof candidate.success === "boolean" &&
    (candidate.error === null || typeof candidate.error === "string")
  );
}

function isModelListResponse(value: unknown): value is RawModelListResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (
    !Array.isArray(candidate.data) ||
    !(candidate.nextCursor === null || typeof candidate.nextCursor === "string")
  ) {
    return false;
  }
  return candidate.data.every((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const model = entry as Record<string, unknown>;
    return (
      typeof model.id === "string" &&
      typeof model.model === "string" &&
      typeof model.displayName === "string" &&
      typeof model.description === "string" &&
      typeof model.hidden === "boolean" &&
      Array.isArray(model.inputModalities) &&
      model.inputModalities.every(
        (item: unknown) => typeof item === "string",
      ) &&
      typeof model.isDefault === "boolean"
    );
  });
}
