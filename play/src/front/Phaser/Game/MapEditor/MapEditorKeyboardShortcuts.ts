export type MapEditorHistoryAction = "undo" | "redo";

type HistoryKeyboardEvent = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target">;

export function getMapEditorHistoryAction(event: HistoryKeyboardEvent): MapEditorHistoryAction | undefined {
    if (event.key.toLowerCase() !== "z" || event.altKey || (!event.metaKey && !event.ctrlKey)) return undefined;
    if (isEditableTarget(event.target)) return undefined;
    return event.shiftKey ? "redo" : "undo";
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (target === null || typeof target !== "object") return false;
    const candidate = target as { isContentEditable?: unknown; tagName?: unknown };
    if (candidate.isContentEditable === true) return true;
    return (
        typeof candidate.tagName === "string" &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(candidate.tagName.toUpperCase())
    );
}
