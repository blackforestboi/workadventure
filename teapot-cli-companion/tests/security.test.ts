import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  hasValidToken,
  resolveInside,
  validateGenerateRequest,
} from "../src/security.js";

describe("companion request security", () => {
  it("compares bearer tokens without accepting partial values", () => {
    expect(
      hasValidToken({ authorization: "Bearer secret-token" }, "secret-token"),
    ).toBe(true);
    expect(
      hasValidToken({ authorization: "Bearer secret" }, "secret-token"),
    ).toBe(false);
    expect(hasValidToken({}, "secret-token")).toBe(false);
  });

  it("rejects paths outside the per-job directory", () => {
    const root = resolve("/tmp/teapot-job");
    expect(resolveInside(root, "output.png")).toBe(resolve(root, "output.png"));
    expect(() => resolveInside(root, "../secret")).toThrow(
      "invalid output path",
    );
  });

  it("accepts only fixed providers, targets, models, and raster references", () => {
    const valid: Record<string, unknown> = {
      provider: "codex",
      prompt: "A small transparent tree",
      target: "map-object",
      model: "gpt-image-1",
      references: [
        { name: "tree.png", mimeType: "image/png", base64: "aGVsbG8=" },
      ],
    };
    expect(() => validateGenerateRequest(valid)).not.toThrow();
    expect(() =>
      validateGenerateRequest({ ...valid, provider: "shell" }),
    ).toThrow("Unsupported CLI provider");
    expect(() =>
      validateGenerateRequest({ ...valid, model: "x; rm -rf" }),
    ).toThrow("Invalid model name");
    expect(() =>
      validateGenerateRequest({
        ...valid,
        references: [
          {
            name: "payload.svg",
            mimeType: "image/svg+xml",
            base64: "PHN2Zz4=",
          },
        ],
      }),
    ).toThrow("Unsupported reference image type");
  });
});
