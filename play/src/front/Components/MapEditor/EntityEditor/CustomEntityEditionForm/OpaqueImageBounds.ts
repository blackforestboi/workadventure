import { ENTITY_SIZE_TILE_OPTIONS } from "../../../../Utils/EntityPrefabSize";

export function getOpaqueImageBounds(data: Uint8ClampedArray, width: number, height: number) {
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

    return right < left || bottom < top ? undefined : { width: right - left + 1, height: bottom - top + 1 };
}

export function getDefaultHeightInTiles(contentWidth: number, contentHeight: number): number {
    const ratio = Math.max(0.5, contentHeight / Math.max(1, contentWidth));
    return ENTITY_SIZE_TILE_OPTIONS.reduce((closest, option) =>
        Math.abs(option - ratio) < Math.abs(closest - ratio) ? option : closest,
    );
}
