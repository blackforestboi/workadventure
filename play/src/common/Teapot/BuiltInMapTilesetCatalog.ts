import { LEGACY_WORKADVENTURE_TILESETS, type LegacyWorkAdventureTileset } from "./LegacyWorkAdventureTilesetCatalog";
import { BUILT_IN_TERRAIN_TILESETS, type BuiltInTerrainTileset } from "./BuiltInTerrainCatalog";

export interface BuiltInMapTileset {
    id: string;
    name: string;
    image: string;
    width: number;
    height: number;
    columns: number;
    rows: number;
    tileCount: number;
    matchesImage(image: string): boolean;
}

export const BUILT_IN_MAP_TILESETS: readonly BuiltInMapTileset[] = [
    ...BUILT_IN_TERRAIN_TILESETS,
    ...LEGACY_WORKADVENTURE_TILESETS,
];

export const BUILT_IN_LEGACY_MAP_TILESETS: readonly LegacyWorkAdventureTileset[] = LEGACY_WORKADVENTURE_TILESETS;

export function getBuiltInMapTileset(image: string): BuiltInMapTileset | undefined {
    return BUILT_IN_MAP_TILESETS.find((tileset) => tileset.matchesImage(image));
}

export function isLegacyWorkAdventureTileset(tileset: BuiltInMapTileset): tileset is LegacyWorkAdventureTileset {
    return LEGACY_WORKADVENTURE_TILESETS.some((candidate) => candidate.id === tileset.id);
}

export type { BuiltInTerrainTileset, LegacyWorkAdventureTileset };
