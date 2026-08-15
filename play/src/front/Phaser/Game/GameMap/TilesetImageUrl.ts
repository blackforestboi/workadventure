import { getBuiltInMapTileset } from "../../../../common/Teapot/BuiltInMapTilesetCatalog";

/**
 * Resolves a tileset image independently from the map document's host.
 *
 * The bundled terrain atlas is served by Play, whereas user map documents are
 * served by map-storage. Older saved maps referenced the atlas with a
 * root-relative URL, which otherwise incorrectly targets map-storage.
 */
export function resolveTilesetImageUrl(image: string, mapUrl: string, playOrigin: string): string {
    const builtInTileset = getBuiltInMapTileset(image);
    if (builtInTileset !== undefined) {
        return new URL(builtInTileset.image, playOrigin).toString();
    }

    return new URL(image, mapUrl).toString();
}
