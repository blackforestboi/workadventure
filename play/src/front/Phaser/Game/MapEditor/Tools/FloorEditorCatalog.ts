import {
    forEachTileInLayer,
    getTileLayerGid,
    surfaceOverlayCoverLayerName,
    waterUnderlayCoverLayerName,
} from "@workadventure/map-editor";
import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";

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

export function resolveVegetationSelectionLayer(selectedLayer: string, layers: readonly ITiledMapLayer[]): string {
    const tileLayerNames = flattenLayers(layers)
        .filter((layer) => layer.type === "tilelayer")
        .map((layer) => layer.name);
    return chooseDefaultPaintLayer(tileLayerNames) || (tileLayerNames.includes(selectedLayer) ? selectedLayer : "");
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

/** Finds the visible surface that should border water without targeting unrelated layers above it. */
export function findTopmostSurfaceLayer(
    layers: readonly ITiledMapLayer[],
    coverLayerName: string,
    x: number,
    y: number,
): string | undefined {
    const flattenedLayers = flattenLayersWithVisibility(layers);
    const surfaceLayerNames = new Set(
        flattenedLayers
            .filter(
                (candidate) =>
                    candidate.visible &&
                    candidate.layer.type === "tilelayer" &&
                    (candidate.layer.name === coverLayerName ||
                        surfaceOverlayCoverLayerName(candidate.layer.name) === coverLayerName),
            )
            .map((candidate) => candidate.layer.name),
    );
    for (let index = flattenedLayers.length - 1; index >= 0; index -= 1) {
        const candidate = flattenedLayers[index];
        if (candidate === undefined || !candidate.visible || candidate.layer.type !== "tilelayer") continue;
        const underlayCoverLayerName = waterUnderlayCoverLayerName(candidate.layer.name);
        if (
            underlayCoverLayerName !== undefined &&
            surfaceLayerNames.has(underlayCoverLayerName) &&
            getTileLayerGid(candidate.layer, x, y) !== 0
        ) {
            return underlayCoverLayerName;
        }
        const overlayCoverLayerName = surfaceOverlayCoverLayerName(candidate.layer.name);
        if (candidate.layer.name !== coverLayerName && overlayCoverLayerName !== coverLayerName) continue;
        if (getTileLayerGid(candidate.layer, x, y) !== 0) return candidate.layer.name;
    }
    return undefined;
}

/** Finds an occupied surface at the starting cell when it belongs to the selected tileset. */
export function findMatchingSurfaceLayer(
    map: ITiledMap,
    coverLayerName: string,
    selectedTilesetFirstGid: number,
    x: number,
    y: number,
): string | undefined {
    const tilesetFirstGids = map.tilesets
        .map((tileset) => tileset.firstgid)
        .filter((firstGid): firstGid is number => typeof firstGid === "number")
        .sort((left, right) => left - right);
    const selectedTilesetIndex = tilesetFirstGids.indexOf(selectedTilesetFirstGid);
    if (selectedTilesetIndex === -1) return undefined;
    const nextTilesetFirstGid = tilesetFirstGids[selectedTilesetIndex + 1] ?? Number.POSITIVE_INFINITY;

    const flattenedLayers = flattenLayersWithVisibility(map.layers);
    // Tiled stores render order from back to front, so the first occupied related surface decides the result.
    for (let index = flattenedLayers.length - 1; index >= 0; index -= 1) {
        const candidate = flattenedLayers[index];
        if (candidate === undefined || !candidate.visible || candidate.layer.type !== "tilelayer") continue;
        if (
            candidate.layer.name !== coverLayerName &&
            surfaceOverlayCoverLayerName(candidate.layer.name) !== coverLayerName
        ) {
            continue;
        }
        const gid = getTileLayerGid(candidate.layer, x, y);
        if (gid === 0) continue;
        return gid >= selectedTilesetFirstGid && gid < nextTilesetFirstGid ? candidate.layer.name : undefined;
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
