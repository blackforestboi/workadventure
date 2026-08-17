import { surfaceOverlayCoverLayerName, waterUnderlayCoverLayerName } from "@workadventure/map-editor";
import type { ITiledMapLayer } from "@workadventure/tiled-map-type-guard";

const COMPOSITE_LAYER_DEPTH_STEP = 0.001;

/** Resolves nested authored layers (for example water below a surface overlay) to their real map layer. */
export function getCompositeTileLayerBaseName(layerName: string): string {
    const visited = new Set<string>();
    let currentLayerName = layerName;
    while (!visited.has(currentLayerName)) {
        visited.add(currentLayerName);
        const coverLayerName =
            waterUnderlayCoverLayerName(currentLayerName) ?? surfaceOverlayCoverLayerName(currentLayerName);
        if (coverLayerName === undefined) return currentLayerName;
        currentLayerName = coverLayerName;
    }
    return layerName;
}

/** Keeps model-only composite layers in Tiled stack order while sharing their base layer's render band. */
export function getCompositeTileLayerDepthOffset(layers: readonly ITiledMapLayer[], layerName: string): number {
    const flatLayers = flattenLayers(layers);
    const layerIndex = flatLayers.findIndex((layer) => layer.name === layerName);
    const baseLayerIndex = flatLayers.findIndex((layer) => layer.name === getCompositeTileLayerBaseName(layerName));
    if (layerIndex === -1 || baseLayerIndex === -1) return 0;
    return (layerIndex - baseLayerIndex) * COMPOSITE_LAYER_DEPTH_STEP;
}

function flattenLayers(layers: readonly ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => (layer.type === "group" ? flattenLayers(layer.layers) : [layer]));
}
