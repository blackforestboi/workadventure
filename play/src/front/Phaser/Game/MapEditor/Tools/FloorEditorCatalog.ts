import { forEachTileInLayer, getTileLayerGid } from "@workadventure/map-editor";
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

export function findTopmostErasableLayer(layers: readonly ITiledMapLayer[], x: number, y: number): string | undefined {
    const flattenedLayers = flattenLayersWithVisibility(layers);
    // Tiled stores render order from back to front, so inspect the visible stack in reverse.
    for (let index = flattenedLayers.length - 1; index >= 0; index -= 1) {
        const candidate = flattenedLayers[index];
        if (
            candidate === undefined ||
            !candidate.visible ||
            candidate.layer.type !== "tilelayer" ||
            SYSTEM_LAYER_PATTERN.test(candidate.layer.name)
        ) {
            continue;
        }
        if (getTileLayerGid(candidate.layer, x, y) !== 0) return candidate.layer.name;
    }
    return undefined;
}

/**
 * Returns only map tiles that have already been used as a surface. This prevents legacy
 * furniture spritesheets from being presented as hundreds of chopped-up terrain assets.
 */
export function collectTerrainGids(layers: readonly ITiledMapLayer[]): ReadonlySet<number> {
    const tileLayers = flattenLayers(layers).filter(
        (layer): layer is Extract<ITiledMapLayer, { type: "tilelayer" }> => layer.type === "tilelayer",
    );
    const namedTerrainLayers = tileLayers.filter((layer) => TERRAIN_LAYER_PATTERN.test(layer.name));
    const fallbackLayerName = chooseDefaultPaintLayer(tileLayers.map((layer) => layer.name));
    const terrainLayers =
        namedTerrainLayers.length > 0
            ? namedTerrainLayers
            : tileLayers.filter((layer) => layer.name === fallbackLayerName);
    const gids = new Set<number>();
    for (const layer of terrainLayers) {
        forEachTileInLayer(layer, (gid) => {
            if (Number.isInteger(gid) && gid > 0) gids.add(gid);
        });
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

function flattenLayersWithVisibility(
    layers: readonly ITiledMapLayer[],
    parentVisible = true,
): readonly { layer: ITiledMapLayer; visible: boolean }[] {
    return layers.flatMap((layer) => {
        const visible = parentVisible && layer.visible !== false;
        return [
            { layer, visible },
            ...(layer.type === "group" ? flattenLayersWithVisibility(layer.layers, visible) : []),
        ];
    });
}
