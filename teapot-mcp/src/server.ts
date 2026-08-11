import { createServer } from "node:http";

import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { toNodeHandler } from "@modelcontextprotocol/node";
import { asError } from "catch-unknown";

import { createTeapotMcpServer } from "./createTeapotMcpServer.js";
import { TeapotMcpApiClient } from "./TeapotMcpApiClient.js";

const host = process.env.TEAPOT_MCP_HOST ?? "127.0.0.1";
const port = readPort(process.env.TEAPOT_MCP_PORT ?? "17374");
const pusherUrl = process.env.TEAPOT_PUSHER_URL ?? "http://127.0.0.1:3001";
const allowedHosts = new Set(
  (
    process.env.TEAPOT_MCP_ALLOWED_HOSTS ??
    `localhost:${port},127.0.0.1:${port}`
  )
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0),
);

const handler = createMcpHandler((context) => {
  const token = context.authInfo?.token;
  if (token === undefined)
    throw new Error("An authenticated Teapot MCP session is required");
  return createTeapotMcpServer(
    new TeapotMcpApiClient({ pusherUrl, bearerToken: token }),
  );
});
const nodeHandler = toNodeHandler(handler, {
  onerror: (error) => logSafeError("Teapot MCP transport error", error),
});

const server = createServer(async (request, response) => {
  try {
    if (request.url === "/healthz") {
      response.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify({ status: "ok", service: "teapot-mcp" }));
      return;
    }
    if (request.url !== "/mcp") {
      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }
    const requestHost = readSingleHeader(request.headers.host)?.toLowerCase();
    if (requestHost === undefined || !allowedHosts.has(requestHost)) {
      response.writeHead(421, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Unrecognized MCP host" }));
      return;
    }
    const token = readBearerToken(
      readSingleHeader(request.headers.authorization),
    );
    if (token === undefined) {
      response.writeHead(401, {
        "Content-Type": "application/json",
        "WWW-Authenticate": "Bearer",
      });
      response.end(
        JSON.stringify({ error: "A Teapot MCP bearer token is required" }),
      );
      return;
    }

    const api = new TeapotMcpApiClient({ pusherUrl, bearerToken: token });
    const session = await api.authenticate(AbortSignal.timeout(10_000));
    const auth: AuthInfo = {
      token,
      clientId: session.sessionId,
      scopes: ["mcp.connect", "map.edit", "map.publish"],
      expiresAt: Math.floor(new Date(session.expiresAt).getTime() / 1_000),
      extra: { ownerId: session.ownerId, clientName: session.clientName },
    };
    await nodeHandler(Object.assign(request, { auth }), response);
  } catch (error: unknown) {
    logSafeError("Teapot MCP request failed", error);
    if (!response.headersSent)
      response.writeHead(401, { "Content-Type": "application/json" });
    if (!response.writableEnded)
      response.end(
        JSON.stringify({ error: "The MCP session is invalid or expired" }),
      );
  }
});

server.listen(port, host, () => {
  console.info(`Teapot MCP listening on http://${host}:${port}/mcp`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close((error) => {
      if (error) {
        console.error("Teapot MCP shutdown failed", error);
        process.exitCode = 1;
      }
    });
  });
}

function readBearerToken(
  authorization: string | undefined,
): string | undefined {
  if (authorization === undefined) return undefined;
  const match = /^Bearer ([A-Za-z0-9._~-]{32,2048})$/.exec(authorization);
  return match?.[1];
}

function readSingleHeader(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readPort(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535)
    throw new Error("TEAPOT_MCP_PORT is invalid");
  return parsed;
}

function logSafeError(label: string, error: unknown): void {
  // Never pass request/error objects to the logger: fetch and transport errors
  // may retain Authorization headers containing the browser-issued bearer token.
  console.error(label, { errorName: asError(error).name });
}
