import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { CodexBridge, type CodexBridgeService } from "./codexBridge.js";
import {
  CompanionRequestError,
  hasValidToken,
  validateGenerateRequest,
} from "./security.js";

const DEFAULT_PORT = 17_374;
const MAX_BODY_BYTES = 18 * 1024 * 1024;
const MAX_OWNER_LENGTH = 512;
const MAX_PAIRING_ID_LENGTH = 256;

export interface HostedBridgeServerOptions {
  serviceSecret: string;
  codex: CodexBridgeService;
}

/**
 * Internal service surface. Browsers must call authenticated Pusher routes;
 * only Pusher receives the service secret and supplies X-Teapot-Owner.
 */
export function createHostedBridgeServer(options: HostedBridgeServerOptions) {
  return createServer(async (request, response) => {
    applyBaseHeaders(response);
    const requestUrl = new URL(request.url ?? "/", "http://teapot.internal");
    if (requestUrl.pathname === "/health" && request.method === "GET") {
      return sendJson(response, 200, { ok: true });
    }
    if (!hasValidToken(request.headers, options.serviceSecret)) {
      return sendJson(response, 401, {
        error: "Bridge authorization required",
      });
    }
    let owner: string;
    try {
      owner = readOwner(request);
      return await routeCodexRequest(
        request,
        response,
        requestUrl,
        owner,
        options.codex,
      );
    } catch (error) {
      const status =
        error instanceof CompanionRequestError ? error.statusCode : 500;
      if (!(error instanceof CompanionRequestError)) {
        const errorName = error instanceof Error ? error.name : typeof error;
        const errorCode =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code.slice(0, 80)
            : "unknown";
        process.stderr.write(
          `[teapot-ai] unclassified bridge failure: ${errorName}/${errorCode}\n`,
        );
      }
      return sendJson(response, status, {
        error:
          error instanceof CompanionRequestError
            ? error.message
            : "Codex bridge request failed",
      });
    }
  });
}

async function routeCodexRequest(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
  owner: string,
  bridge: CodexBridgeService,
): Promise<void> {
  const path = requestUrl.pathname;
  if (path === "/v1/oauth/codex/start" && request.method === "POST") {
    return sendJson(response, 200, await bridge.startOAuth(owner));
  }
  if (path === "/v1/oauth/codex/status" && request.method === "GET") {
    const pairingId = readPairingId(requestUrl.searchParams.get("pairingId"));
    return sendJson(response, 200, await bridge.oauthStatus(owner, pairingId));
  }
  if (path === "/v1/oauth/codex/complete" && request.method === "POST") {
    const body = parseObject(await readBody(request));
    if (body.userCode !== undefined || body.code !== undefined) {
      throw new CompanionRequestError(
        "Enter the Codex device code at the verification URL",
        400,
      );
    }
    const pairingId = readPairingId(body.pairingId);
    return sendJson(response, 200, await bridge.oauthStatus(owner, pairingId));
  }
  if (path === "/v1/oauth/codex/connection" && request.method === "DELETE") {
    await bridge.disconnect(owner);
    response.statusCode = 204;
    response.end();
    return;
  }
  if (path === "/v1/providers/codex/capabilities" && request.method === "GET") {
    return sendJson(response, 200, await bridge.capabilities(owner));
  }
  if (path === "/v1/providers/codex/models" && request.method === "GET") {
    return sendJson(response, 200, {
      provider: "codex",
      models: await bridge.models(owner),
    });
  }
  if (path === "/v1/providers/codex/generate" && request.method === "POST") {
    const body = parseObject(await readBody(request));
    if (body.provider !== undefined && body.provider !== "codex") {
      throw new CompanionRequestError("Provider does not match route", 400);
    }
    const candidate: unknown = { ...body, provider: "codex" };
    validateGenerateRequest(candidate);
    const controller = new AbortController();
    const onClose = () =>
      controller.abort(new Error("Bridge client disconnected"));
    response.once("close", onClose);
    try {
      return sendJson(
        response,
        200,
        await bridge.generate(owner, candidate, controller.signal),
      );
    } finally {
      response.removeListener("close", onClose);
    }
  }
  if (path.includes("/claude/")) {
    throw new CompanionRequestError("Claude bridge is not configured", 503);
  }
  throw new CompanionRequestError("Not found", 404);
}

function readOwner(request: IncomingMessage): string {
  const value = request.headers["x-teapot-owner"];
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_OWNER_LENGTH ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new CompanionRequestError("Valid X-Teapot-Owner required", 401);
  }
  return value;
}

function readPairingId(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_PAIRING_ID_LENGTH ||
    !/^[A-Za-z0-9._:-]+$/.test(value)
  ) {
    throw new CompanionRequestError("Valid pairingId required", 400);
  }
  return value;
}

function parseObject(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new CompanionRequestError("Invalid JSON request", 400);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CompanionRequestError("JSON object required", 400);
  }
  return parsed as Record<string, unknown>;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_BODY_BYTES) {
      throw new CompanionRequestError("Request body is too large", 413);
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function applyBaseHeaders(response: ServerResponse): void {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; frame-ancestors 'none'",
  );
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  if (response.writableEnded) return;
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(value));
}

if (process.env.NODE_ENV !== "test") {
  const serviceSecret = process.env.TEAPOT_CODEX_BRIDGE_SERVICE_SECRET;
  const authRoot = process.env.TEAPOT_CODEX_AUTH_ROOT;
  if (!serviceSecret || serviceSecret.length < 32) {
    throw new Error(
      "TEAPOT_CODEX_BRIDGE_SERVICE_SECRET must contain at least 32 characters",
    );
  }
  if (!authRoot) {
    throw new Error("TEAPOT_CODEX_AUTH_ROOT is required");
  }
  const port = Number.parseInt(
    process.env.TEAPOT_CODEX_BRIDGE_PORT ?? String(DEFAULT_PORT),
    10,
  );
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("TEAPOT_CODEX_BRIDGE_PORT must be a valid TCP port");
  }
  const host = process.env.TEAPOT_CODEX_BRIDGE_HOST ?? "0.0.0.0";
  const codex = new CodexBridge({
    authRoot,
    executable: process.env.TEAPOT_CODEX_CLI,
  });
  const server = createHostedBridgeServer({ serviceSecret, codex });
  server.listen(port, host, () => {
    process.stdout.write(`Teapot Codex bridge listening on ${host}:${port}\n`);
  });
  const shutdown = () => {
    server.close(() => {
      void codex.close().finally(() => process.exit(0));
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}
