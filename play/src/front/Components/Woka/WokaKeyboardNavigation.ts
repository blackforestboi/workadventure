export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
    if (target === null || typeof target !== "object") return false;

    const candidate = target as { isContentEditable?: unknown; tagName?: unknown };
    if (candidate.isContentEditable === true) return true;

    return (
        typeof candidate.tagName === "string" &&
        ["INPUT", "SELECT", "TEXTAREA"].includes(candidate.tagName.toUpperCase())
    );
}
