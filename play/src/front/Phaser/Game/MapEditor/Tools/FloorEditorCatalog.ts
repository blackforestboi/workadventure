import type { ITiledMapLayer } from "@workadventure/tiled-map-type-guard";

const TERRAIN_LAYER_PATTERN = /(^|[\s/_-])(floor|ground|terrain|surface)([\s/_-]|$)/i;
const SYSTEM_LAYER_PATTERN = /(collision|start|exit|zone|interaction)/i;

export function chooseDefaultPaintLayer(layers: readonly string[]): string {
    return (
        layers.find((layer) => TERRAIN_LAYER_PATTERN.test(layer)) ??
        layers.find((layer) => !SYSTEM_LAYER_PATTERN.test(layer)) ??
        layers[0] ??
        ""
    );
}

export function resolveBrushLayer(selectedLayer: string, layers: readonly string[]): string {
    return selectedLayer === "" ? chooseDefaultPaintLayer(layers) : selectedLayer;
}

/**
 * Returns only map tiles that have already been used as a surface. This prevents legacy
 * furniture spritesheets from being presented as hundreds of chopped-up terrain assets.
 */
export function collectTerrainGids(layers: readonly ITiledMapLayer[]): ReadonlySet<number> {
    const tileLayers = flattenLayers(layers).filter(
        (layer): layer is ITiledMapLayer & { type: "tilelayer"; data: number[] } =>
            layer.type === "tilelayer" && Array.isArray(layer.data),
    );
    const namedTerrainLayers = tileLayers.filter((layer) => TERRAIN_LAYER_PATTERN.test(layer.name));
    const fallbackLayerName = chooseDefaultPaintLayer(tileLayers.map((layer) => layer.name));
    const terrainLayers =
        namedTerrainLayers.length > 0
            ? namedTerrainLayers
            : tileLayers.filter((layer) => layer.name === fallbackLayerName);
    const gids = new Set<number>();
    for (const layer of terrainLayers) {
        for (const gid of layer.data) {
            if (Number.isInteger(gid) && gid > 0) gids.add(gid);
        }
    }
    return gids;
}

export function getTerrainTilesetGids(
    firstGid: number,
    tileCount: number,
    terrainGids: ReadonlySet<number>,
): readonly number[] {
    if (tileCount === 1) return [firstGid];
    return [...terrainGids]
        .filter((gid) => gid >= firstGid && gid < firstGid + tileCount)
        .sort((left, right) => left - right);
}

function flattenLayers(layers: readonly ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => [layer, ...(layer.type === "group" ? flattenLayers(layer.layers) : [])]);
}
