import type { Input } from "phaser";

const PAN_DRAG_THRESHOLD = 4;

export function isPrimaryPointerDown(pointer: Pick<Input.Pointer, "button">): boolean {
    return pointer.button === 0;
}

export function hasPointerDragged(pointer: Input.Pointer): boolean {
    return Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY) >= PAN_DRAG_THRESHOLD;
}
