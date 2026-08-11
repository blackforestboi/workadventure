import { timingSafeEqual } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import type { IncomingHttpHeaders } from "node:http";

const MAX_PROMPT_LENGTH = 12_000;
const MAX_REFERENCE_BYTES = 12 * 1024 * 1024;
const SAFE_MODEL = /^[a-zA-Z0-9._:/-]{1,160}$/;
const SAFE_NAME = /^[a-zA-Z0-9._-]{1,120}$/;

export class CompanionRequestError extends Error {
  public constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "CompanionRequestError";
  }
}

export function isAllowedOrigin(
  headers: IncomingHttpHeaders,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const origin = headers.origin;
  return typeof origin === "string" && allowedOrigins.has(origin);
}

export function hasValidToken(
  headers: IncomingHttpHeaders,
  expectedToken: string,
): boolean {
  const value = headers.authorization;
  if (typeof value !== "string" || !value.startsWith("Bearer ")) {
    return false;
  }
  const provided = Buffer.from(value.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

export function validateGenerateRequest(
  value: unknown,
): asserts value is import("./types.js").CliGenerateRequest {
  if (!value || typeof value !== "object") {
    throw new CompanionRequestError("Invalid generation request", 400);
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.provider !== "codex" && candidate.provider !== "claude") {
    throw new CompanionRequestError("Unsupported CLI provider", 400);
  }
  if (
    typeof candidate.prompt !== "string" ||
    candidate.prompt.trim().length === 0
  ) {
    throw new CompanionRequestError("Prompt is required", 400);
  }
  if (candidate.prompt.length > MAX_PROMPT_LENGTH) {
    throw new CompanionRequestError("Prompt is too long", 413);
  }
  if (
    !(
      ["woka-sheet", "woka-layer", "map-object", "tileset"] as unknown[]
    ).includes(candidate.target)
  ) {
    throw new CompanionRequestError("Unsupported asset target", 400);
  }
  if (
    candidate.model !== undefined &&
    (typeof candidate.model !== "string" || !SAFE_MODEL.test(candidate.model))
  ) {
    throw new CompanionRequestError("Invalid model name", 400);
  }
  if (candidate.references === undefined) {
    return;
  }
  if (!Array.isArray(candidate.references) || candidate.references.length > 4) {
    throw new CompanionRequestError(
      "At most four references are supported",
      400,
    );
  }
  let totalBytes = 0;
  for (const reference of candidate.references) {
    if (!reference || typeof reference !== "object") {
      throw new CompanionRequestError("Invalid reference image", 400);
    }
    const item = reference as Record<string, unknown>;
    if (typeof item.name !== "string" || !SAFE_NAME.test(item.name)) {
      throw new CompanionRequestError("Invalid reference image name", 400);
    }
    if (
      !(["image/png", "image/jpeg", "image/webp"] as unknown[]).includes(
        item.mimeType,
      )
    ) {
      throw new CompanionRequestError("Unsupported reference image type", 400);
    }
    if (
      typeof item.base64 !== "string" ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(item.base64)
    ) {
      throw new CompanionRequestError("Invalid reference image data", 400);
    }
    totalBytes += Buffer.byteLength(item.base64, "base64");
    if (totalBytes > MAX_REFERENCE_BYTES) {
      throw new CompanionRequestError("Reference images are too large", 413);
    }
  }
}

export function resolveInside(root: string, path: string): string {
  const rootPath = resolve(root);
  const candidate = resolve(rootPath, path);
  const rel = relative(rootPath, candidate);
  if (
    isAbsolute(rel) ||
    rel === ".." ||
    rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
  ) {
    throw new CompanionRequestError("CLI returned an invalid output path", 502);
  }
  return candidate;
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof CompanionRequestError) {
    return error.message;
  }
  return "The local CLI generation failed";
}
