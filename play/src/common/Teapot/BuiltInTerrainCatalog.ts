import type { TerrainAutotileTiles } from "./TerrainAutotile";

export const BUILT_IN_TERRAIN_CATALOG_VERSION = "2026-08-11.1";

export const BUILT_IN_TERRAIN_TYPES = [
    "earth",
    "grass",
    "sand",
    "stone",
    "path",
    "water",
    "snow",
    "lava",
    "void",
] as const;

export type BuiltInTerrainType = (typeof BUILT_IN_TERRAIN_TYPES)[number];

export interface BuiltInTerrainAsset {
    /** Stable identifier for map-generation prompts and API consumers. */
    id: string;
    /** Zero-based local tile ID in the built-in LPC terrain atlas. */
    tileId: number;
    name: string;
    description: string;
    terrainType: BuiltInTerrainType;
    /** Search-focused synonyms, material, biome, and placement vocabulary. */
    tags: readonly string[];
    /** Whether a player should be unable to cross this terrain cell. */
    solid: boolean;
    /** This atlas has no Tiled animation metadata for these cells. */
    animated: false;
    /** A family groups compatible edge, corner, and fill variants. */
    family: string;
    /** Human-readable source coordinate, useful when debugging a generated map. */
    atlasCoordinate: { column: number; row: number };
    /** LLM-friendly, normalized searchable representation of all metadata. */
    searchText: string;
}

export interface BuiltInTerrainGroup {
    id: string;
    name: string;
    description: string;
    terrainType: BuiltInTerrainType;
    searchTerms: string;
    tileIds: readonly number[];
    displayTileIds: readonly number[];
    previewTileId: number;
    autotile?: TerrainAutotileTiles;
}

export interface BuiltInTerrainSearch {
    query?: string;
    terrainType?: BuiltInTerrainType;
    solid?: boolean;
}

const IMAGE_URL = "/resources/tilesets/lpc-outdoor-terrain.png";
const ATLAS_COLUMNS = 32;
const EMPTY_TERRAIN_TILE_IDS = new Set<number>([640, 672, 704, 742, 910]);

interface TerrainFamilyDefinition {
    id: string;
    name: string;
    terrainType: BuiltInTerrainType;
    solid: boolean;
    tags: readonly string[];
    description: string;
    tileIds: readonly number[];
    displayTileIds?: readonly number[];
    previewTileId?: number;
    autotile?: TerrainAutotileTiles;
}

type TerrainAutotileOuterTiles = Omit<
    TerrainAutotileTiles,
    "innerTopLeft" | "innerTopRight" | "innerBottomLeft" | "innerBottomRight"
>;

const wangTileIds = (outer: TerrainAutotileOuterTiles, innerCorners: readonly number[]): readonly number[] => [
    ...innerCorners,
    outer.topLeft,
    outer.top,
    outer.topRight,
    outer.left,
    outer.center,
    outer.right,
    outer.bottomLeft,
    outer.bottom,
    outer.bottomRight,
];

const range = (start: number, end: number): readonly number[] =>
    Array.from({ length: end - start + 1 }, (_, index) => start + index);

const rectangle = (firstRow: number, lastRow: number, firstColumn: number, lastColumn: number): readonly number[] =>
    Array.from({ length: lastRow - firstRow + 1 }, (_, rowOffset) =>
        range(firstColumn, lastColumn).map((column) => (firstRow + rowOffset) * ATLAS_COLUMNS + column),
    ).flat();

/**
 * Curated after inspecting the complete LPC outdoor atlas. This deliberately contains
 * only continuous background surfaces and their compatible transition variants. Props,
 * furniture, bridges, walls, crops, stairs, and decorative sprites remain out of the
 * terrain catalog and belong in the Objects editor.
 */
const TERRAIN_FAMILIES: readonly TerrainFamilyDefinition[] = [
    {
        id: "light-dirt",
        name: "Light dirt",
        terrainType: "earth",
        solid: false,
        tags: ["dirt", "soil", "earth", "beige", "light brown", "ground", "outdoor", "path edge"],
        description:
            "Light brown packed dirt and soil ground for parks, villages, trails, farms, and dry outdoor clearings. Includes compatible fill, edge, corner, and transition variants.",
        autotile: {
            topLeft: 64,
            top: 65,
            topRight: 66,
            left: 96,
            center: 97,
            right: 98,
            bottomLeft: 128,
            bottom: 129,
            bottomRight: 130,
            innerTopLeft: 34,
            innerTopRight: 33,
            innerBottomLeft: 2,
            innerBottomRight: 1,
        },
        tileIds: wangTileIds(
            {
                topLeft: 64,
                top: 65,
                topRight: 66,
                left: 96,
                center: 97,
                right: 98,
                bottomLeft: 128,
                bottom: 129,
                bottomRight: 130,
            },
            [1, 2, 33, 34],
        ),
        displayTileIds: [64, 65, 66, 96, 97, 98, 128, 129, 130, 1, 2, 33, 34],
        previewTileId: 97,
    },
    {
        id: "dark-dirt",
        name: "Dark dirt",
        terrainType: "earth",
        solid: false,
        tags: ["dark dirt", "dark soil", "earth", "mud", "brown", "ground", "cave floor", "transition"],
        description:
            "Dark brown soil and earthen ground for shaded clearings, caves, damp ground, and richer outdoor dirt paths. Includes compatible fill, edge, corner, and transition variants.",
        autotile: {
            topLeft: 73,
            top: 74,
            topRight: 75,
            left: 105,
            center: 106,
            right: 107,
            bottomLeft: 137,
            bottom: 138,
            bottomRight: 139,
            innerTopLeft: 43,
            innerTopRight: 42,
            innerBottomLeft: 11,
            innerBottomRight: 10,
        },
        tileIds: wangTileIds(
            {
                topLeft: 73,
                top: 74,
                topRight: 75,
                left: 105,
                center: 106,
                right: 107,
                bottomLeft: 137,
                bottom: 138,
                bottomRight: 139,
            },
            [10, 11, 42, 43],
        ),
        displayTileIds: [73, 74, 75, 105, 106, 107, 137, 138, 139, 10, 11, 42, 43],
        previewTileId: 106,
    },
    {
        id: "lava",
        name: "Lava",
        terrainType: "lava",
        solid: true,
        tags: ["lava", "molten", "fire", "volcanic", "hazard", "hot", "orange", "red", "blocked"],
        description:
            "Molten lava terrain for volcanic caves, fire realms, dangerous pits, and impassable hazards. These cells are solid so players cannot cross them.",
        tileIds: rectangle(0, 5, 15, 17),
    },
    {
        id: "earthen-pit",
        name: "Earthen pit",
        terrainType: "void",
        solid: true,
        tags: ["pit", "hole", "chasm", "void", "crater", "cliff", "cave opening", "blocked"],
        description:
            "Rocky and earthen pit, hole, chasm, and crater terrain for cliffs, caves, excavations, and impassable map boundaries. These cells are solid so players cannot cross them.",
        tileIds: rectangle(0, 5, 18, 23),
    },
    {
        id: "meadow-grass",
        name: "Meadow grass",
        terrainType: "grass",
        solid: false,
        tags: ["grass", "lawn", "meadow", "green", "field", "park", "outdoor", "ground", "biome"],
        description:
            "Green meadow and lawn terrain for gardens, parks, fields, forests, and temperate outdoor maps. Includes compatible grass fill, edge, corner, and transition variants.",
        autotile: {
            topLeft: 256,
            top: 257,
            topRight: 258,
            left: 288,
            center: 289,
            right: 290,
            bottomLeft: 320,
            bottom: 321,
            bottomRight: 322,
            innerTopLeft: 226,
            innerTopRight: 225,
            innerBottomLeft: 194,
            innerBottomRight: 193,
        },
        tileIds: wangTileIds(
            {
                topLeft: 256,
                top: 257,
                topRight: 258,
                left: 288,
                center: 289,
                right: 290,
                bottomLeft: 320,
                bottom: 321,
                bottomRight: 322,
            },
            [193, 194, 225, 226],
        ),
        displayTileIds: [256, 257, 258, 288, 289, 290, 320, 321, 322, 193, 194, 225, 226],
        previewTileId: 289,
    },
    {
        id: "golden-grass",
        name: "Golden grass",
        terrainType: "grass",
        solid: false,
        tags: ["golden grass", "dry grass", "yellow grass", "field", "savanna", "meadow", "outdoor", "ground"],
        description:
            "Golden dry grass and field terrain for late-summer meadows, savannas, harvest landscapes, and warm outdoor biomes. Includes compatible fill and transition variants.",
        tileIds: [...rectangle(6, 11, 15, 17)],
    },
    {
        id: "sandy-shore",
        name: "Sandy shore",
        terrainType: "sand",
        solid: false,
        tags: ["sand", "beach", "shore", "desert", "coast", "dune", "pale ground", "outdoor"],
        description:
            "Pale sand, beach, and shore terrain for coasts, deserts, dunes, and dry paths. Includes compatible sand fill, edge, corner, and shoreline transition variants.",
        tileIds: [...rectangle(6, 11, 18, 20), ...rectangle(28, 28, 14, 17)],
    },
    {
        id: "stone-path",
        name: "Stone path",
        terrainType: "path",
        solid: false,
        tags: ["stone path", "paving", "cobblestone", "flagstone", "walkway", "road", "plaza", "courtyard"],
        description:
            "Walkable gray stone paving and flagstone path terrain for plazas, courtyards, town roads, ruins, and garden walkways. Includes compatible fill, edge, and transition variants.",
        tileIds: rectangle(18, 22, 0, 5),
    },
    {
        id: "water",
        name: "Water",
        terrainType: "water",
        solid: true,
        tags: ["water", "river", "pond", "lake", "blue", "shoreline", "wetland", "blocked", "impassable"],
        description:
            "Borderless blue water fill for rivers, lakes, ponds, streams, and wetlands. Water is placed beneath the surrounding surface, whose edge and corner tiles form the shoreline. Open water is solid unless an explicit crossing object is present.",
        autotile: {
            topLeft: 655,
            top: 656,
            topRight: 657,
            left: 687,
            center: 688,
            right: 689,
            bottomLeft: 719,
            bottom: 720,
            bottomRight: 721,
            innerTopLeft: 625,
            innerTopRight: 624,
            innerBottomLeft: 593,
            innerBottomRight: 592,
        },
        tileIds: wangTileIds(
            {
                topLeft: 655,
                top: 656,
                topRight: 657,
                left: 687,
                center: 688,
                right: 689,
                bottomLeft: 719,
                bottom: 720,
                bottomRight: 721,
            },
            [592, 593, 624, 625],
        ),
        displayTileIds: [688],
        previewTileId: 688,
    },
    {
        id: "snow-and-ice",
        name: "Snow and ice",
        terrainType: "snow",
        solid: false,
        tags: ["snow", "ice", "frozen", "winter", "arctic", "glacier", "cold", "white", "blue"],
        description:
            "Snowy and icy ground for winter villages, arctic maps, frozen lakes, glaciers, and cold-weather paths. Includes compatible snow fill, edge, corner, and frozen-water transition variants.",
        tileIds: rectangle(16, 22, 18, 23),
    },
    {
        id: "farm-earth",
        name: "Farm earth",
        terrainType: "earth",
        solid: false,
        tags: ["farm soil", "tilled earth", "mud", "field", "garden bed", "agriculture", "brown ground", "outdoor"],
        description:
            "Tilled farm soil and muddy earth ground for vegetable patches, gardens, agricultural fields, and rustic outdoor scenes. Includes compatible soil fill and transition variants.",
        tileIds: rectangle(23, 26, 3, 6),
    },
    {
        id: "desert-ground",
        name: "Desert ground",
        terrainType: "sand",
        solid: false,
        tags: ["desert", "sand", "ochre", "arid", "dune", "dry ground", "yellow earth", "outdoor"],
        description:
            "Warm ochre desert and dry sandy ground for arid biomes, canyons, desert towns, and sun-baked outdoor paths. Includes compatible fill and transition variants.",
        tileIds: rectangle(28, 29, 23, 27),
    },
    {
        id: "rocky-ground",
        name: "Rocky ground",
        terrainType: "stone",
        solid: false,
        tags: ["rock", "stone", "cave floor", "slate", "dark stone", "ruins", "ground", "underground"],
        description:
            "Dark rocky stone ground for caves, ruins, mountains, mines, and underground paths. Includes compatible stone fill and transition variants.",
        tileIds: rectangle(29, 29, 29, 31),
    },
];

const makeAsset = (family: TerrainFamilyDefinition, tileId: number, variant: number): BuiltInTerrainAsset => {
    const row = Math.floor(tileId / ATLAS_COLUMNS);
    const column = tileId % ATLAS_COLUMNS;
    const name = `${family.name} — variant ${String(variant + 1).padStart(2, "0")}`;
    const tags = [
        ...family.tags,
        family.terrainType,
        family.name.toLowerCase(),
        `tile ${tileId}`,
        `row ${row}`,
        `column ${column}`,
    ];
    return {
        id: `workadventure-lpc-outdoor-terrain:${tileId}`,
        tileId,
        name,
        description: `${family.description} Atlas coordinate: row ${row}, column ${column}; local tile ID ${tileId}.`,
        terrainType: family.terrainType,
        tags,
        solid: family.solid,
        animated: false,
        family: family.name,
        atlasCoordinate: { column, row },
        searchText: [name, family.description, ...tags].join(" ").toLowerCase(),
    };
};

export const BUILT_IN_TERRAIN_ASSETS: readonly BuiltInTerrainAsset[] = TERRAIN_FAMILIES.flatMap((family) =>
    family.tileIds
        .filter((tileId) => !EMPTY_TERRAIN_TILE_IDS.has(tileId))
        .map((tileId, variant) => makeAsset(family, tileId, variant)),
);

const duplicateTileIds = BUILT_IN_TERRAIN_ASSETS.filter(
    (asset, index, assets) => assets.findIndex((candidate) => candidate.tileId === asset.tileId) !== index,
);
if (duplicateTileIds.length > 0) {
    throw new Error(
        `Built-in terrain metadata contains duplicate tile IDs: ${duplicateTileIds.map((asset) => asset.tileId).join(", ")}`,
    );
}

export const BUILT_IN_TERRAIN_TILESET = {
    id: "workadventure-lpc-outdoor-terrain",
    name: "Outdoor terrain",
    image: IMAGE_URL,
    width: 1024,
    height: 1024,
    columns: ATLAS_COLUMNS,
    rows: 32,
    tileCount: 1024,
    groups: TERRAIN_FAMILIES.map(
        (family): BuiltInTerrainGroup => ({
            id: family.id,
            name: family.name,
            description: family.description,
            terrainType: family.terrainType,
            searchTerms: family.tags.join(" "),
            tileIds: family.tileIds,
            displayTileIds: family.displayTileIds ?? family.tileIds,
            previewTileId: family.previewTileId ?? family.tileIds[0],
            autotile: family.autotile,
        }),
    ),
    matchesImage(image: string): boolean {
        return image.split(/[?#]/, 1)[0].endsWith(IMAGE_URL);
    },
} as const;

export function getBuiltInTerrainTileIds(): readonly number[] {
    return BUILT_IN_TERRAIN_ASSETS.map((asset) => asset.tileId);
}

export function getBuiltInTerrainAsset(tileId: number): BuiltInTerrainAsset | undefined {
    return BUILT_IN_TERRAIN_ASSETS.find((asset) => asset.tileId === tileId);
}

/** Returns contour metadata only for a verified shape-ready terrain family. */
export function getBuiltInTerrainAutotile(tileId: number): TerrainAutotileTiles | undefined {
    return TERRAIN_FAMILIES.find((family) => family.autotile !== undefined && family.tileIds.includes(tileId))
        ?.autotile;
}

/** Water uses its centre sprite as a boundary-free fill beneath the surrounding surface. */
export function getBuiltInWaterFillTileId(tileId: number): number | undefined {
    const family = TERRAIN_FAMILIES.find(
        (candidate) =>
            candidate.terrainType === "water" && candidate.autotile !== undefined && candidate.tileIds.includes(tileId),
    );
    return family?.autotile?.center;
}

export function searchBuiltInTerrainAssets(search: BuiltInTerrainSearch = {}): readonly BuiltInTerrainAsset[] {
    const queryTokens = (search.query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    return BUILT_IN_TERRAIN_ASSETS.filter(
        (asset) =>
            (search.terrainType === undefined || asset.terrainType === search.terrainType) &&
            (search.solid === undefined || asset.solid === search.solid) &&
            queryTokens.every((token) => asset.searchText.includes(token)),
    );
}

/**
 * The atlas deliberately keeps terrain and non-terrain art in one source image. The
 * complete catalog gives map-generation clients semantic metadata for every visible
 * cell, while BUILT_IN_TERRAIN_ASSETS remains the safe, terrain-only editor palette.
 */
export const BUILT_IN_ATLAS_ASSET_KINDS = [
    "terrain",
    "terrain-fragment",
    "structure",
    "prop",
    "vegetation",
    "decoration",
] as const;

export type BuiltInAtlasAssetKind = (typeof BUILT_IN_ATLAS_ASSET_KINDS)[number];

export type BuiltInAtlasPlacement = "terrain-tile" | "single-tile-object" | "multi-tile-fragment";

export interface BuiltInAtlasAsset {
    id: string;
    tileId: number;
    name: string;
    description: string;
    kind: BuiltInAtlasAssetKind;
    /** Terrain type is present only for terrain and terrain-fragment assets. */
    terrainType?: BuiltInTerrainType;
    tags: readonly string[];
    /** Default collision recommendation. Object instances may define a finer collision area. */
    solid: boolean;
    animated: false;
    family: string;
    placement: BuiltInAtlasPlacement;
    editorEligible: boolean;
    atlasCoordinate: { column: number; row: number };
    searchText: string;
}

export interface BuiltInAtlasAssetSearch {
    query?: string;
    kind?: BuiltInAtlasAssetKind;
    terrainType?: BuiltInTerrainType;
    solid?: boolean;
}

interface AtlasFamilyDefinition {
    name: string;
    kind: Exclude<BuiltInAtlasAssetKind, "terrain">;
    terrainType?: BuiltInTerrainType;
    solid: boolean;
    placement: Exclude<BuiltInAtlasPlacement, "terrain-tile">;
    tags: readonly string[];
    description: string;
    tileIds: readonly number[];
}

const EMPTY_ATLAS_TILE_IDS = new Set<number>([
    428, 523, 587, 590, 605, 619, 622, 635, 636, 637, 640, 654, 667, 668, 669, 672, 681, 686, 696, 697, 698, 699, 700,
    701, 704, 710, 711, 716, 718, 742, 743, 750, 775, 782, 807, 814, 830, 831, 839, 846, 862, 863, 877, 878, 894, 895,
    908, 909, 910, 917, 918, 924, 925, 932, 933, 934, 941, 942, 966, 970, 971, 998, 1002, 1003,
]);

const ATLAS_FAMILIES: readonly AtlasFamilyDefinition[] = [
    {
        name: "Uncurated earth transition",
        kind: "terrain-fragment",
        terrainType: "earth",
        solid: false,
        placement: "multi-tile-fragment",
        tags: ["terrain", "transition", "dirt", "earth", "edge", "corner", "manual composition"],
        description:
            "Earth and dirt transition cells that are not part of a verified single-palette Wang set. Keep them available to metadata and map-generation clients as manually composed fragments, but do not present them as compatible standalone floor choices.",
        tileIds: rectangle(0, 5, 0, 14),
    },
    {
        name: "Uncurated grass transition",
        kind: "terrain-fragment",
        terrainType: "grass",
        solid: false,
        placement: "multi-tile-fragment",
        tags: ["terrain", "transition", "grass", "meadow", "edge", "corner", "manual composition"],
        description:
            "Grass and meadow transition cells that are not part of the verified Meadow grass Wang set. Keep them available as manually composed terrain fragments without mixing them into the automatic shape palette.",
        tileIds: [...rectangle(6, 10, 0, 2), ...rectangle(6, 10, 4, 14), ...rectangle(11, 11, 0, 0)],
    },
    {
        name: "Uncurated water transition",
        kind: "terrain-fragment",
        terrainType: "water",
        solid: true,
        placement: "multi-tile-fragment",
        tags: ["terrain", "transition", "water", "river", "shore", "edge", "corner", "manual composition"],
        description:
            "Water and shoreline transition cells that are not part of the verified River Wang set. Keep them available as manually composed solid fragments without mixing them into the automatic shape palette.",
        tileIds: rectangle(17, 22, 15, 17),
    },
    {
        name: "Cave and cliff boundary",
        kind: "terrain-fragment",
        terrainType: "void",
        solid: true,
        placement: "multi-tile-fragment",
        tags: ["cave", "cliff", "pit", "chasm", "void", "rock boundary", "blocked", "outdoor"],
        description:
            "Cave mouth, cliff edge, rocky pit, and chasm boundary fragments. Combine adjacent source cells to form a continuous impassable cave or cliff edge; do not use as a standalone floor tile.",
        tileIds: rectangle(0, 5, 24, 31),
    },
    {
        name: "Garden landmark",
        kind: "prop",
        solid: true,
        placement: "single-tile-object",
        tags: ["garden", "landmark", "well", "fountain", "outdoor prop", "village", "solid"],
        description:
            "A single-tile outdoor garden or village landmark prop, such as a well or fountain. Place on the Objects layer; its default collision is solid.",
        tileIds: rectangle(6, 11, 3, 3),
    },
    {
        name: "Meadow vegetation detail",
        kind: "vegetation",
        solid: false,
        placement: "single-tile-object",
        tags: ["meadow", "grass", "flower", "plant", "garden", "field", "outdoor decoration"],
        description:
            "Small meadow grass, flower, and plant detail sprites for dressing lawns, gardens, parks, and fields. Place on the Objects layer; they are non-solid by default.",
        tileIds: rectangle(11, 11, 1, 14),
    },
    {
        name: "Shoreline and cliff fragment",
        kind: "terrain-fragment",
        terrainType: "water",
        solid: true,
        placement: "multi-tile-fragment",
        tags: ["shore", "water edge", "cliff", "beach", "cave", "coast", "blocked", "transition"],
        description:
            "Water, shoreline, beach, and cliff transition fragments for composing coastlines, ponds, and caves. They are solid by default and should be composed with neighbouring cells rather than used as floor fill.",
        tileIds: rectangle(6, 11, 21, 31),
    },
    {
        name: "Stone architecture",
        kind: "structure",
        solid: true,
        placement: "multi-tile-fragment",
        tags: ["stone", "wall", "stairs", "architecture", "ruins", "dungeon", "building", "blocked"],
        description:
            "Multi-tile stone wall, stair, masonry, and ruin fragments for buildings, dungeons, and architectural boundaries. Place on the Objects layer and keep the default solid collision.",
        tileIds: rectangle(12, 17, 0, 14),
    },
    {
        name: "Frozen shoreline fragment",
        kind: "terrain-fragment",
        terrainType: "snow",
        solid: true,
        placement: "multi-tile-fragment",
        tags: ["snow", "ice", "frozen water", "shore", "winter", "cave", "transition", "blocked"],
        description:
            "Frozen shoreline, snowbank, and icy cave transition fragments for winter maps. Compose the neighbouring cells as a scene boundary; they are solid by default.",
        tileIds: rectangle(12, 17, 15, 23),
    },
    {
        name: "Cliff, ladder, and cave structure",
        kind: "structure",
        solid: true,
        placement: "multi-tile-fragment",
        tags: ["cliff", "ladder", "cave", "rock wall", "vertical", "mountain", "blocked", "structure"],
        description:
            "Multi-tile cliff face, ladder, cave wall, and rocky vertical structure fragments. Place on the Objects layer and retain solid collision unless a specific passage is authored.",
        tileIds: rectangle(12, 17, 24, 31),
    },
    {
        name: "Barrel, plank, and bridge prop",
        kind: "prop",
        solid: true,
        placement: "multi-tile-fragment",
        tags: ["barrel", "wood", "plank", "bridge", "dock", "village", "outdoor prop", "solid"],
        description:
            "Wooden barrel, plank, dock, and bridge fragments. Compose bridges and docks from neighbouring cells on the Objects layer; the default collision is solid until a walkable crossing is explicitly configured.",
        tileIds: rectangle(18, 22, 6, 14),
    },
    {
        name: "Marsh and rock detail",
        kind: "decoration",
        solid: false,
        placement: "single-tile-object",
        tags: ["marsh", "wetland", "rock", "pebble", "puddle", "water detail", "outdoor decoration"],
        description:
            "Marsh, wetland, pebble, puddle, and rock detail sprites for dressing outdoor water edges. Place on the Objects layer; they are non-solid by default and can be overridden per object instance.",
        tileIds: rectangle(18, 22, 24, 31),
    },
    {
        name: "Vegetation and crop detail",
        kind: "vegetation",
        solid: false,
        placement: "single-tile-object",
        tags: ["vegetation", "plant", "crop", "vegetable", "grass", "bush", "flower", "farm", "garden", "outdoor"],
        description:
            "Plants, vegetable crops, bushes, flowers, and tall grass detail sprites for gardens, farms, forests, and outdoor scenes. Place on the Objects layer; they are non-solid by default so collision can be drawn only around a pot, trunk, or other base.",
        tileIds: rectangle(23, 29, 0, 6),
    },
    {
        name: "Wooden bridge and fence structure",
        kind: "structure",
        solid: true,
        placement: "multi-tile-fragment",
        tags: ["wood", "bridge", "fence", "boardwalk", "dock", "rail", "structure", "outdoor"],
        description:
            "Multi-tile wooden bridge, fence, rail, boardwalk, and dock fragments. Assemble neighbouring cells on the Objects layer; configure a deliberate walkable crossing when needed.",
        tileIds: rectangle(23, 29, 7, 14),
    },
    {
        name: "Coastal terrain detail",
        kind: "terrain-fragment",
        terrainType: "sand",
        solid: false,
        placement: "multi-tile-fragment",
        tags: ["coast", "sand", "water edge", "shore", "beach", "terrain detail", "transition"],
        description:
            "Coastal sand, water-edge, and shoreline terrain detail fragments. Compose adjacent cells to form beaches and shorelines; they are non-solid by default.",
        tileIds: rectangle(23, 29, 15, 22),
    },
    {
        name: "Rocky ground detail",
        kind: "terrain-fragment",
        terrainType: "stone",
        solid: false,
        placement: "multi-tile-fragment",
        tags: ["rock", "stone", "ground detail", "cave floor", "desert", "ruins", "terrain transition"],
        description:
            "Rocky ground, cave-floor, desert, and ruin terrain detail fragments. Use with matching adjacent source cells to form a continuous surface; they are non-solid by default.",
        tileIds: rectangle(23, 29, 23, 31),
    },
    {
        name: "Cave prop and architectural detail",
        kind: "prop",
        solid: true,
        placement: "multi-tile-fragment",
        tags: ["cave", "rock", "gate", "sign", "architecture", "ruins", "underground", "solid"],
        description:
            "Cave props, stone fixtures, gates, signs, and architectural detail fragments for underground scenes. Place on the Objects layer; the default collision is solid and can be refined per object instance.",
        tileIds: rectangle(30, 31, 0, 22),
    },
    {
        name: "Late-atlas ground detail",
        kind: "terrain-fragment",
        terrainType: "stone",
        solid: false,
        placement: "multi-tile-fragment",
        tags: ["ground", "stone", "dirt", "grass", "terrain detail", "surface", "outdoor", "transition"],
        description:
            "Late-atlas ground and surface detail fragments for stone, dirt, and grass transitions. Compose them with adjacent cells rather than using them as standalone floor tiles.",
        tileIds: rectangle(30, 31, 23, 31),
    },
];

const terrainAssetsByTileId = new Map(BUILT_IN_TERRAIN_ASSETS.map((asset) => [asset.tileId, asset]));

function makeAtlasAsset(tileId: number): BuiltInAtlasAsset {
    const terrain = terrainAssetsByTileId.get(tileId);
    if (terrain !== undefined) {
        return {
            ...terrain,
            kind: "terrain",
            placement: "terrain-tile",
            editorEligible: true,
        };
    }

    const family = ATLAS_FAMILIES.find((candidate) => candidate.tileIds.includes(tileId));
    if (family === undefined) {
        throw new Error(`Built-in atlas metadata is missing a classification for tile ${tileId}`);
    }
    const row = Math.floor(tileId / ATLAS_COLUMNS);
    const column = tileId % ATLAS_COLUMNS;
    const name = `${family.name} — fragment ${String(tileId).padStart(4, "0")}`;
    const tags = [
        ...family.tags,
        family.kind,
        family.name.toLowerCase(),
        `tile ${tileId}`,
        `row ${row}`,
        `column ${column}`,
    ];
    return {
        id: `workadventure-lpc-outdoor-atlas:${tileId}`,
        tileId,
        name,
        description: `${family.description} Atlas coordinate: row ${row}, column ${column}; local tile ID ${tileId}.`,
        kind: family.kind,
        terrainType: family.terrainType,
        tags,
        solid: family.solid,
        animated: false,
        family: family.name,
        placement: family.placement,
        editorEligible: false,
        atlasCoordinate: { column, row },
        searchText: [name, family.description, ...tags].join(" ").toLowerCase(),
    };
}

export const BUILT_IN_ATLAS_ASSETS: readonly BuiltInAtlasAsset[] = Array.from(
    { length: BUILT_IN_TERRAIN_TILESET.tileCount },
    (_, tileId) => tileId,
)
    .filter((tileId) => !EMPTY_ATLAS_TILE_IDS.has(tileId))
    .map(makeAtlasAsset);

if (BUILT_IN_ATLAS_ASSETS.length !== 960) {
    throw new Error(`Expected 960 non-empty atlas cells, found ${BUILT_IN_ATLAS_ASSETS.length}`);
}

export function searchBuiltInAtlasAssets(search: BuiltInAtlasAssetSearch = {}): readonly BuiltInAtlasAsset[] {
    const queryTokens = (search.query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    return BUILT_IN_ATLAS_ASSETS.filter(
        (asset) =>
            (search.kind === undefined || asset.kind === search.kind) &&
            (search.terrainType === undefined || asset.terrainType === search.terrainType) &&
            (search.solid === undefined || asset.solid === search.solid) &&
            queryTokens.every((token) => asset.searchText.includes(token)),
    );
}
