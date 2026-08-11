export interface TileIndexSet {
    containsTileIndex(gid: number): boolean;
}

interface TileLayerRenderer {
    tileset: TileIndexSet | readonly TileIndexSet[];
}

export function tileLayerCanRenderGid(layer: TileLayerRenderer | undefined, gid: number): boolean {
    if (gid === 0) return true;
    if (layer === undefined) return false;
    const tilesets = Array.isArray(layer.tileset) ? layer.tileset : [layer.tileset];
    return tilesets.some((tileset) => tileset.containsTileIndex(gid));
}

export function findTilesetForGid<T extends TileIndexSet>(tilesets: readonly T[], gid: number): T | undefined {
    return tilesets.find((tileset) => tileset.containsTileIndex(gid));
}
