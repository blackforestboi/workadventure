import { describe, expect, it } from "vitest";
import { classifyCliGenerationFailure } from "../src/providers/AbstractCliProvider.js";

describe("CLI generation failure classification", () => {
  it("reports an unavailable image tool without exposing raw process output", () => {
    const result = classifyCliGenerationFailure("codex", {
      stdout: "private prompt",
      stderr: "image_generation tool is not available; /private/owner/path",
    });

    expect(result).toEqual({
      code: "image-tool-unavailable",
      message:
        "Codex is connected, but its image-generation tool is unavailable in this runtime",
    });
    expect(result.message).not.toContain("private");
  });

  it("uses a bounded fallback for unknown CLI failures", () => {
    expect(
      classifyCliGenerationFailure("codex", {
        stdout: "secret",
        stderr: "boom",
      }),
    ).toEqual({
      code: "unknown",
      message: "Codex could not create the requested image",
    });
  });
});
