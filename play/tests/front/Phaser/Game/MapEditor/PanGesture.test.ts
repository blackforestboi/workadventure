import { describe, expect, it } from "vitest";
import { isPrimaryPointerDown } from "../../../../../src/front/Phaser/Game/MapEditor/PanGesture";

describe("map editor pan gestures", () => {
    it("recognizes a primary press even when no button remains held", () => {
        const quickPrimaryPress = { button: 0, buttons: 0 };

        expect(isPrimaryPointerDown(quickPrimaryPress)).toBe(true);
        expect(isPrimaryPointerDown({ button: 2 })).toBe(false);
    });
});
