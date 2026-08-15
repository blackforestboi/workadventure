import { afterEach, describe, expect, it, vi } from "vitest";

import {
    getMapEditorHistoryAction,
    registerMapEditorHistoryShortcut,
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
    afterEach(() => vi.unstubAllGlobals());

    it("maps the native macOS Cmd shortcuts to undo and redo", () => {
        vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Macintosh" });

        expect(getMapEditorHistoryAction(keyboardEvent({ metaKey: true }))).toBe("undo");
        expect(getMapEditorHistoryAction(keyboardEvent({ metaKey: true, shiftKey: true }))).toBe("redo");
        expect(getMapEditorHistoryAction(keyboardEvent({ ctrlKey: true }))).toBeUndefined();
    });

    it("maps the native non-Mac Ctrl shortcuts to undo and redo", () => {
        vi.stubGlobal("navigator", { platform: "Win32", userAgent: "Windows" });

        expect(getMapEditorHistoryAction(keyboardEvent({ ctrlKey: true }))).toBe("undo");
        expect(getMapEditorHistoryAction(keyboardEvent({ ctrlKey: true, shiftKey: true }))).toBe("redo");
    });

    it("delivers a real macOS window Cmd+Z event directly to the undo handler", () => {
        vi.stubGlobal("navigator", { platform: "MacIntel", userAgent: "Macintosh" });
        const handleAction = vi.fn();
        const unregister = registerMapEditorHistoryShortcut(handleAction, () => true);
        const event = new KeyboardEvent("keydown", {
            key: "z",
            metaKey: true,
            bubbles: true,
            cancelable: true,
        });

        window.dispatchEvent(event);

        expect(handleAction).toHaveBeenCalledOnce();
        expect(handleAction).toHaveBeenCalledWith("undo");
        expect(event.defaultPrevented).toBe(true);
        unregister();
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
