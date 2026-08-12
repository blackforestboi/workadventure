import { isCenteredMap } from "@workadventure/map-editor";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";

export interface TileLayerPosition {
    x?: number;
    y?: number;
    offsetx?: number;
    offsety?: number;
}

/**
 * Centered, infinite maps are authored as an open-ended signed tile grid.
 * This is a map invariant, not a transient map-editor UI state: it must
 * survive a scene rebuild after a browser reload.
 */
export function canExpandMap(map: ITiledMap): boolean {
    return map.infinite === true && isCenteredMap(map);
}

/**
 * Phaser's GPU tilemap renderer currently applies a layer's world position
 * twice. Keep expandable signed maps on the CPU renderer because their dense
 * rendering bounds can change at runtime, and reject GPU rendering for maps
 * that already have a non-zero layer position.
 */
export function canUseGpuTilemapRenderer(
    layer: TileLayerPosition,
    tileWidth: number,
    tileHeight: number,
    mapCanExpand: boolean,
): boolean {
    if (mapCanExpand) return false;

    const worldX = (layer.x ?? 0) * tileWidth + (layer.offsetx ?? 0);
    const worldY = (layer.y ?? 0) * tileHeight + (layer.offsety ?? 0);
    return worldX === 0 && worldY === 0;
}
