import { describe, expect, it } from "vitest";

import { isEditableKeyboardTarget } from "../../../../src/front/Components/Woka/WokaKeyboardNavigation";

describe("Woka keyboard navigation", () => {
    it.each(["input", "select", "textarea"])("treats %s controls as editable", (tagName) => {
        expect(isEditableKeyboardTarget({ tagName } as unknown as EventTarget)).toBe(true);
    });

    it("treats contenteditable elements as editable", () => {
        expect(isEditableKeyboardTarget({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
    });

    it("allows Woka navigation from non-editable targets", () => {
        expect(isEditableKeyboardTarget({ tagName: "button" } as unknown as EventTarget)).toBe(false);
    });
});
