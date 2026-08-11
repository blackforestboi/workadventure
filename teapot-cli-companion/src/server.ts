import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { CodexCliProvider } from "./providers/CodexCliProvider.js";
import { ClaudeCliProvider } from "./providers/ClaudeCliProvider.js";
import {
  CompanionRequestError,
  hasValidToken,
  isAllowedOrigin,
  publicErrorMessage,
  validateGenerateRequest,
} from "./security.js";
import type { CliProvider, CliProviderName } from "./types.js";

const DEFAULT_PORT = 17373;
const MAX_BODY_BYTES = 18 * 1024 * 1024;
const SAFE_PAIRING_REQUEST_ID = /^[a-zA-Z0-9_-]{8,128}$/;

export interface CompanionServerOptions {
  allowedOrigins: ReadonlySet<string>;
  token: string;
  providers: ReadonlyMap<CliProviderName, CliProvider>;
}

export function createCompanionServer(options: CompanionServerOptions) {
  let activeGeneration = false;
  return createServer(async (request, response) => {
    applyBaseHeaders(response);
    const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
    if (requestUrl.pathname === "/connect" && request.method === "GET") {
      return sendPairingPage(response, requestUrl, options);
    }
    const originAllowed = isAllowedOrigin(
      request.headers,
      options.allowedOrigins,
    );
    if (request.method === "OPTIONS") {
      if (!originAllowed)
        return sendJson(response, 403, { error: "Origin is not allowed" });
      applyCorsHeaders(request, response);
      response.writeHead(204).end();
      return;
    }
    if (requestUrl.pathname === "/health" && request.method === "GET") {
      return sendJson(response, 200, { ok: true });
    }
    if (!originAllowed)
      return sendJson(response, 403, { error: "Origin is not allowed" });
    applyCorsHeaders(request, response);
    if (!hasValidToken(request.headers, options.token)) {
      return sendJson(response, 401, {
        error: "Companion authorization is required",
      });
    }
    if (
      requestUrl.pathname === "/v1/capabilities" &&
      request.method === "GET"
    ) {
      const capabilities = await Promise.all(
        [...options.providers.values()].map((provider) =>
          provider.capabilities(),
        ),
      );
      return sendJson(response, 200, { providers: capabilities });
    }
    if (requestUrl.pathname === "/v1/generate" && request.method === "POST") {
      if (activeGeneration)
        return sendJson(response, 429, {
          error: "Another CLI generation is already running",
        });
      activeGeneration = true;
      const controller = new AbortController();
      const onClose = () => controller.abort(new Error("Browser disconnected"));
      response.once("close", onClose);
      try {
        const body: unknown = JSON.parse(await readBody(request));
        validateGenerateRequest(body);
        const provider = options.providers.get(body.provider);
        if (!provider)
          throw new CompanionRequestError("CLI provider is unavailable", 503);
        const capability = await provider.capabilities();
        if (
          !capability.installed ||
          capability.imageGeneration === "unavailable"
        ) {
          throw new CompanionRequestError(
            capability.reason ?? "CLI image generation is unavailable",
            503,
          );
        }
        const result = await provider.generate(body, controller.signal);
        return sendJson(response, 200, result);
      } catch (error) {
        const status =
          error instanceof CompanionRequestError ? error.statusCode : 500;
        return sendJson(response, status, { error: publicErrorMessage(error) });
      } finally {
        response.removeListener("close", onClose);
        activeGeneration = false;
      }
    }
    return sendJson(response, 404, { error: "Not found" });
  });
}

function sendPairingPage(
  response: ServerResponse,
  requestUrl: URL,
  options: CompanionServerOptions,
): void {
  const origin = requestUrl.searchParams.get("origin");
  if (origin === null || !options.allowedOrigins.has(origin)) {
    sendJson(response, 403, { error: "Origin is not allowed" });
    return;
  }
  const provider = requestUrl.searchParams.get("provider");
  if (provider !== "codex" && provider !== "claude") {
    sendJson(response, 400, { error: "Unsupported CLI provider" });
    return;
  }
  const requestId = requestUrl.searchParams.get("requestId");
  if (requestId === null || !SAFE_PAIRING_REQUEST_ID.test(requestId)) {
    sendJson(response, 400, { error: "Invalid pairing request" });
    return;
  }

  const nonce = randomBytes(18).toString("base64url");
  const payload = serializeForInlineScript({
    type: "teapot.cli-companion.connected",
    requestId,
    provider,
    token: options.token,
  });
  const targetOrigin = serializeForInlineScript(origin);
  const providerName = provider === "codex" ? "Codex" : "Claude";
  response.setHeader(
    "Content-Security-Policy",
    `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'`,
  );
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Connect ${providerName} CLI</title>
    <style nonce="${nonce}">
      :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #111827; color: #f9fafb; }
      main { max-width: 30rem; margin: 2rem; padding: 2rem; border: 1px solid #374151; border-radius: 1rem; background: #1f2937; }
      h1 { margin-top: 0; }
      p { color: #d1d5db; line-height: 1.5; }
    </style>
  </head>
  <body>
    <main>
      <h1>Connecting ${providerName} CLI…</h1>
      <p id="status">Returning a one-session token to Teapot Maps. Your CLI login stays on this computer.</p>
    </main>
    <script nonce="${nonce}">
      const status = document.getElementById("status");
      if (window.opener) {
        window.opener.postMessage(${payload}, ${targetOrigin});
        status.textContent = "Connected. This window will close automatically.";
        window.setTimeout(() => window.close(), 350);
      } else {
        status.textContent = "Return to Teapot Maps and click Connect again.";
      }
    </script>
  </body>
</html>`);
}

function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
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

function applyCorsHeaders(
  request: IncomingMessage,
  response: ServerResponse,
): void {
  response.setHeader(
    "Access-Control-Allow-Origin",
    request.headers.origin ?? "",
  );
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type",
  );
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Max-Age", "600");
  response.setHeader("Vary", "Origin");
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > MAX_BODY_BYTES)
      throw new CompanionRequestError("Request body is too large", 413);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
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

function getAllowedOrigins(): ReadonlySet<string> {
  const configured = process.env.TEAPOT_ALLOWED_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(
    configured?.length ? configured : ["http://play.workadventure.localhost"],
  );
}

if (process.env.NODE_ENV !== "test") {
  const token =
    process.env.TEAPOT_COMPANION_TOKEN ?? randomBytes(32).toString("base64url");
  const port = Number.parseInt(
    process.env.TEAPOT_COMPANION_PORT ?? String(DEFAULT_PORT),
    10,
  );
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error("TEAPOT_COMPANION_PORT must be a valid TCP port");
  }
  const server = createCompanionServer({
    allowedOrigins: getAllowedOrigins(),
    token,
    providers: new Map<CliProviderName, CliProvider>([
      ["codex", new CodexCliProvider()],
      ["claude", new ClaudeCliProvider()],
    ]),
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(
      `Teapot CLI companion listening on http://127.0.0.1:${port}\n`,
    );
    process.stdout.write(
      `Allowed origins: ${[...getAllowedOrigins()].join(", ")}\n`,
    );
    process.stdout.write(
      `Paste this one-session token into Teapot Maps: ${token}\n`,
    );
  });
}
