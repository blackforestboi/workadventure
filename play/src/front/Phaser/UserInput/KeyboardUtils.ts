export function isSpaceKey(event: Pick<KeyboardEvent, "code" | "key">): boolean {
    return event.code === "Space" || event.key === " " || event.key === "Spacebar";
}
