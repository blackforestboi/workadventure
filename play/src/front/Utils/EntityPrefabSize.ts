export const MAP_TILE_SIZE = 32;
export const ENTITY_SIZE_TILE_OPTIONS = [0.5, 1, 2, 4, 8, 16, 32, 50, 75, 100] as const;

export function getEntityDisplaySize(
    naturalWidth: number,
    naturalHeight: number,
    defaultSizeInTiles: number | undefined,
): { width: number; height: number } {
    if (defaultSizeInTiles === undefined || naturalWidth <= 0 || naturalHeight <= 0) {
        return { width: naturalWidth, height: naturalHeight };
    }

    const width = defaultSizeInTiles * MAP_TILE_SIZE;
    return { width, height: width * (naturalHeight / naturalWidth) };
}
