export interface TileLayerPosition {
    x?: number;
    y?: number;
    offsetx?: number;
    offsety?: number;
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
