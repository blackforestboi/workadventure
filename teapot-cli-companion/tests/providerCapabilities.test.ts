import { describe, expect, it } from "vitest";
import { CodexCliProvider } from "../src/providers/CodexCliProvider.js";

describe("CLI provider capabilities", () => {
  it("makes an installed executable available without a paid generation probe", async () => {
    const provider = new CodexCliProvider(process.execPath);

    await expect(provider.capabilities()).resolves.toMatchObject({
      provider: "codex",
      installed: true,
      imageGeneration: "available",
    });
  });
});
