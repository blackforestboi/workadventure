import {
    compactTeapotTileRegions,
    applyTeapotTerrainMutation,
    getTileLayerGid,
    type TeapotTerrainMutation,
    type TeapotTilePatch,
    type TeapotTileRegion,
} from "@workadventure/map-editor";
import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";

export interface FloorEdit {
    forward: TeapotTerrainMutation;
    backward: TeapotTerrainMutation;
}

export function collapseTileRegions(regions: readonly TeapotTileRegion[]): TeapotTileRegion[] {
    return compactTeapotTileRegions(regions);
}

export function createFloorEdit(map: ITiledMap, patch: TeapotTerrainMutation | TeapotTilePatch): FloorEdit | undefined {
    const forward: TeapotTerrainMutation = {
        mapId: patch.mapId,
        regions: patch.regions,
        ...("layerJson" in patch
            ? {
                  layerJson: patch.layerJson,
                  removeLayer: patch.removeLayer,
                  beforeLayer: patch.beforeLayer,
              }
            : {}),
    };
    const historyMap =
        forward.layerJson !== undefined && !forward.removeLayer
            ? applyTeapotTerrainMutation(map, { ...forward, regions: [] })
            : map;
    const backwardRegions: TeapotTileRegion[] = [];
    let changesMap = forward.layerJson !== undefined;

    for (const region of forward.regions) {
        const layer = flattenLayers(historyMap.layers).find((candidate) => candidate.name === region.layer);
        if (layer?.type !== "tilelayer") continue;
        const gids: number[] = [];

        for (let y = 0; y < region.height; y += 1) {
            for (let x = 0; x < region.width; x += 1) {
                const absoluteX = region.x + x;
                const absoluteY = region.y + y;
                const previousGid = getTileLayerGid(layer, absoluteX, absoluteY);
                const nextGid = region.gids[y * region.width + x] ?? 0;
                gids.push(previousGid);
                if (previousGid !== nextGid) changesMap = true;
            }
        }

        backwardRegions.push({ ...region, gids });
    }

    if (!changesMap) return undefined;
    return {
        forward,
        backward: {
            mapId: patch.mapId,
            regions: backwardRegions,
            ...(forward.layerJson === undefined
                ? {}
                : {
                      layerJson: forward.layerJson,
                      removeLayer: !forward.removeLayer,
                      beforeLayer: forward.beforeLayer,
                  }),
        },
    };
}

function flattenLayers(layers: ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => [layer, ...(layer.type === "group" ? flattenLayers(layer.layers) : [])]);
}
