import { describe, expect, it } from "vitest";
import { isSpaceKey } from "../../../../src/front/Phaser/UserInput/KeyboardUtils";

describe("isSpaceKey", () => {
    it.each([
        { code: "Space", key: " " },
        { code: "Space", key: "Spacebar" },
        { code: "Space", key: "Space" },
    ])("recognizes the Space key for %#", (event) => {
        expect(isSpaceKey(event)).toBe(true);
    });

    it("does not recognize another key", () => {
        expect(isSpaceKey({ code: "KeyA", key: "a" })).toBe(false);
    });
});
