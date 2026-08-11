import { BUILT_IN_TERRAIN_TILESET } from "../../../../common/Teapot/BuiltInTerrainCatalog";

/**
 * Resolves a tileset image independently from the map document's host.
 *
 * The bundled terrain atlas is served by Play, whereas user map documents are
 * served by map-storage. Older saved maps referenced the atlas with a
 * root-relative URL, which otherwise incorrectly targets map-storage.
 */
export function resolveTilesetImageUrl(image: string, mapUrl: string, playOrigin: string): string {
    if (BUILT_IN_TERRAIN_TILESET.matchesImage(image)) {
        return new URL(BUILT_IN_TERRAIN_TILESET.image, playOrigin).toString();
    }

    return new URL(image, mapUrl).toString();
}
