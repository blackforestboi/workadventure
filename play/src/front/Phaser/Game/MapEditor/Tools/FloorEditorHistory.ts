import { TeapotTilePatch, type TeapotTileRegion } from "@workadventure/map-editor";
import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";

export interface FloorEdit {
    forward: TeapotTilePatch;
    backward: TeapotTilePatch;
}

export function createFloorEdit(map: ITiledMap, patch: TeapotTilePatch): FloorEdit | undefined {
    const backwardRegions: TeapotTileRegion[] = [];
    let changesMap = false;

    for (const region of patch.regions) {
        const layer = flattenLayers(map.layers).find((candidate) => candidate.name === region.layer);
        if (layer?.type !== "tilelayer" || !Array.isArray(layer.data)) continue;
        const width = layer.width ?? map.width ?? 0;
        const gids: number[] = [];

        for (let y = 0; y < region.height; y += 1) {
            for (let x = 0; x < region.width; x += 1) {
                const index = (region.y + y) * width + region.x + x;
                const previousGid = layer.data[index] ?? 0;
                const nextGid = region.gids[y * region.width + x] ?? 0;
                gids.push(previousGid);
                if (previousGid !== nextGid) changesMap = true;
            }
        }

        backwardRegions.push({ ...region, gids });
    }

    if (!changesMap) return undefined;
    return {
        forward: patch,
        backward: TeapotTilePatch.parse({
            mapId: patch.mapId,
            expectedRevision: patch.expectedRevision,
            regions: backwardRegions,
        }),
    };
}

function flattenLayers(layers: ITiledMapLayer[]): ITiledMapLayer[] {
    return layers.flatMap((layer) => [layer, ...(layer.type === "group" ? flattenLayers(layer.layers) : [])]);
}
