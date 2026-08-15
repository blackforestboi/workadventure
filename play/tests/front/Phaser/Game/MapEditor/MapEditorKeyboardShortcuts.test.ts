import { describe, expect, it } from "vitest";

import {
    getMapEditorHistoryAction,
    releaseMapEditorKeyboardFocus,
} from "../../../../../src/front/Phaser/Game/MapEditor/MapEditorKeyboardShortcuts";

function keyboardEvent(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
    return {
        altKey: false,
        ctrlKey: false,
        key: "z",
        metaKey: false,
        shiftKey: false,
        target: null,
        ...overrides,
    } as KeyboardEvent;
}

describe("getMapEditorHistoryAction", () => {
    it("maps Cmd+Z and Ctrl+Z to undo", () => {
        expect(getMapEditorHistoryAction(keyboardEvent({ metaKey: true }))).toBe("undo");
        expect(getMapEditorHistoryAction(keyboardEvent({ ctrlKey: true }))).toBe("undo");
    });

    it("maps Cmd/Ctrl+Shift+Z to redo", () => {
        expect(getMapEditorHistoryAction(keyboardEvent({ metaKey: true, shiftKey: true }))).toBe("redo");
        expect(getMapEditorHistoryAction(keyboardEvent({ ctrlKey: true, shiftKey: true }))).toBe("redo");
    });

    it("leaves native text editing and unrelated shortcuts alone", () => {
        expect(
            getMapEditorHistoryAction(
                keyboardEvent({ metaKey: true, target: { tagName: "textarea" } as unknown as EventTarget }),
            ),
        ).toBeUndefined();
        expect(getMapEditorHistoryAction(keyboardEvent({ metaKey: true, altKey: true }))).toBeUndefined();
        expect(getMapEditorHistoryAction(keyboardEvent({ metaKey: true, key: "x" }))).toBeUndefined();
    });

    it("releases stale text focus when the user returns to editing the map", () => {
        const input = document.createElement("input");
        document.body.append(input);
        input.focus();

        releaseMapEditorKeyboardFocus();

        expect(document.activeElement).not.toBe(input);
        input.remove();
    });
});
