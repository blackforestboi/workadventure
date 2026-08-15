export type MapEditorHistoryAction = "undo" | "redo";

type HistoryActionHandler = (action: MapEditorHistoryAction) => void;

type HistoryKeyboardEvent = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey" | "target">;

export function getMapEditorHistoryAction(event: HistoryKeyboardEvent): MapEditorHistoryAction | undefined {
    if (event.key.toLowerCase() !== "z" || event.altKey || (!event.metaKey && !isSystemControlPressed(event))) {
        return undefined;
    }
    if (isEditableTarget(event.target)) return undefined;
    return event.shiftKey ? "redo" : "undo";
}

function isSystemControlPressed(event: Pick<HistoryKeyboardEvent, "ctrlKey" | "metaKey">): boolean {
    if (event.metaKey) return true;
    return event.ctrlKey && !isApplePlatform();
}

function isApplePlatform(): boolean {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
    const platform = nav.userAgentData?.platform ?? nav.platform ?? nav.userAgent;
    return /mac|iphone|ipad|ipod/i.test(platform);
}

export function releaseMapEditorKeyboardFocus(): void {
    if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
    }
}

export function registerMapEditorHistoryShortcut(
    handleAction: HistoryActionHandler,
    isActive: () => boolean,
): () => void {
    const keyDownHandler = (event: KeyboardEvent): void => {
        if (!isActive()) return;
        const action = getMapEditorHistoryAction(event);
        if (action === undefined) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        handleAction(action);
    };

    window.addEventListener("keydown", keyDownHandler, true);
    return () => window.removeEventListener("keydown", keyDownHandler, true);
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
