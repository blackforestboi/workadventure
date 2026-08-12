export { getDefaultGeneratedMapObjectGridSize as getDefaultGridSizeInTiles } from "../../../../Utils/GeneratedMapObjectGrid";

export interface OpaqueImageBounds {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface CollisionFrame {
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
}

export function getOpaqueImageBounds(
    data: Uint8ClampedArray,
    width: number,
    height: number,
): OpaqueImageBounds | undefined {
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (data[(y * width + x) * 4 + 3] === 0) continue;
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x);
            bottom = Math.max(bottom, y);
        }
    }

    return right < left || bottom < top ? undefined : { left, top, width: right - left + 1, height: bottom - top + 1 };
}

export function getContainedCollisionFrame(
    bounds: OpaqueImageBounds,
    scaleX: number,
    scaleY: number,
    rows: number,
    columns: number,
): CollisionFrame {
    const safeRows = Math.max(1, rows);
    const safeColumns = Math.max(1, columns);
    const displayedBoundsWidth = bounds.width * scaleX;
    const displayedBoundsHeight = bounds.height * scaleY;
    const cellSize = Math.max(displayedBoundsWidth / safeColumns, displayedBoundsHeight / safeRows);
    const width = cellSize * safeColumns;
    const height = cellSize * safeRows;
    const boundsCenterX = (bounds.left + bounds.width / 2) * scaleX;
    const boundsCenterY = (bounds.top + bounds.height / 2) * scaleY;

    return {
        width,
        height,
        offsetX: boundsCenterX - width / 2,
        offsetY: boundsCenterY - height / 2,
    };
}
