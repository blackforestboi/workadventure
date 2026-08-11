import type { Input } from "phaser";

const PAN_DRAG_THRESHOLD = 4;

export function hasPointerDragged(pointer: Input.Pointer): boolean {
    return Math.hypot(pointer.x - pointer.downX, pointer.y - pointer.downY) >= PAN_DRAG_THRESHOLD;
}
