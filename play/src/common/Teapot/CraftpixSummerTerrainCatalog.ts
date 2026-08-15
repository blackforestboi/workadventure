import type {
    BuiltInTerrainAsset,
    BuiltInTerrainGroup,
    BuiltInTerrainTileset,
    BuiltInTerrainType,
} from "./BuiltInTerrainCatalog";
import type { TerrainAutotileTiles } from "./TerrainAutotile";

const IMAGE_URL = "/collections/CraftpixSummer/assets/terrain/craftpix-summer-terrain.png";
const ATLAS_COLUMNS = 32;
const CONTENT_START_ROW = 32;
const PATCH_COLUMNS = 4;
const PATCH_SIZE_IN_TILES = 8;

interface SummerPatchDefinition {
    id: string;
    name: string;
    terrainType: BuiltInTerrainType;
    solid: boolean;
    tags: readonly string[];
    description: string;
}

const SUMMER_PATCHES: readonly SummerPatchDefinition[] = [
    {
        id: "summer-meadow-texture",
        name: "Summer meadow texture",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "meadow", "ground", "green", "fill"],
        description: "A lively green meadow texture with scattered organic marks for summer fields and lawns.",
    },
    {
        id: "summer-grass-cliff-left",
        name: "Grass cliff — left edge",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "cliff", "ledge", "left", "earth"],
        description: "A multi-tile grassy plateau fragment with an exposed earthen cliff along its left edge.",
    },
    {
        id: "summer-grass-cliff-top",
        name: "Grass cliff — top edge",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "cliff", "ledge", "top", "earth"],
        description: "A multi-tile grassy plateau fragment with an exposed earthen cliff along its upper edge.",
    },
    {
        id: "summer-grass-cliff-right",
        name: "Grass cliff — right edge",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "cliff", "ledge", "right", "earth"],
        description: "A multi-tile grassy plateau fragment with an exposed earthen cliff along its right edge.",
    },
    {
        id: "summer-sandstone-stairs-up",
        name: "Sandstone staircase — ascending",
        terrainType: "stone",
        solid: false,
        tags: ["summer", "sandstone", "stairs", "cliff", "ascending", "structure"],
        description: "Broad pale sandstone steps for manually composing a traversable staircase through a cliff.",
    },
    {
        id: "summer-grass-cliff-split",
        name: "Grass cliff — split edge",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "cliff", "ledge", "split", "earth"],
        description: "A wide grassy plateau fragment with exposed cliff faces on opposing sides.",
    },
    {
        id: "summer-meadow-fill",
        name: "Summer meadow fill",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "meadow", "ground", "green", "fill"],
        description: "A seamless bright summer grass fill for walkable fields, lawns, clearings, and gardens.",
    },
    {
        id: "summer-grass-cliff-right-stairs",
        name: "Grass cliff — right staircase",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "cliff", "ledge", "stairs", "right"],
        description: "A grassy cliff fragment with a pale staircase descending along its right boundary.",
    },
    {
        id: "summer-sandstone-stairs-down",
        name: "Sandstone staircase — descending",
        terrainType: "stone",
        solid: false,
        tags: ["summer", "sandstone", "stairs", "cliff", "descending", "structure"],
        description: "Broad pale sandstone steps mirrored for the opposite direction of a cliff crossing.",
    },
    {
        id: "summer-grass-cliff-horizontal",
        name: "Grass cliff — horizontal ledge",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "cliff", "ledge", "horizontal", "earth"],
        description: "A grassy plateau fragment bounded by exposed earth along its horizontal edges.",
    },
    {
        id: "summer-grass-cliff-bottom-stairs",
        name: "Grass cliff — bottom staircase",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "cliff", "ledge", "stairs", "bottom"],
        description: "A grassy cliff fragment with a pale staircase entering through its lower boundary.",
    },
    {
        id: "summer-grass-island-edge",
        name: "Grass island edge",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "island", "cliff", "edge", "earth"],
        description: "A compact grass-and-earth edge set for raised islands and irregular plateau boundaries.",
    },
    {
        id: "summer-cobblestone-cliff",
        name: "Cobblestone cliff face",
        terrainType: "stone",
        solid: false,
        tags: ["summer", "stone", "cobblestone", "cliff", "wall", "rock"],
        description: "A warm cobblestone cliff face for raised terrain, retaining walls, and rocky boundaries.",
    },
    {
        id: "summer-timber-stairs",
        name: "Timber cliff staircase",
        terrainType: "stone",
        solid: false,
        tags: ["summer", "wood", "timber", "stairs", "cobblestone", "cliff"],
        description: "Wooden stairs crossing a cobblestone cliff face, sliced into native 32-pixel map cells.",
    },
    {
        id: "summer-cobblestone-corner",
        name: "Cobblestone cliff corner",
        terrainType: "stone",
        solid: false,
        tags: ["summer", "stone", "cobblestone", "cliff", "corner", "rock"],
        description: "A rounded cobblestone cliff corner for connecting rocky raised-terrain boundaries.",
    },
    {
        id: "summer-grass-cliff-left-cut",
        name: "Grass cliff — left cut",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "cliff", "ledge", "left", "cut"],
        description: "A grass-and-earth edge fragment for manually shaping an inset on the left side of a plateau.",
    },
    {
        id: "summer-grass-cliff-right-cut",
        name: "Grass cliff — right cut",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "cliff", "ledge", "right", "cut"],
        description: "A grass-and-earth edge fragment for manually shaping an inset on the right side of a plateau.",
    },
    {
        id: "summer-cobblestone-edge",
        name: "Cobblestone cliff edge",
        terrainType: "stone",
        solid: false,
        tags: ["summer", "stone", "cobblestone", "cliff", "edge", "rock"],
        description: "An exposed cobblestone edge section for finishing rocky platforms and retaining walls.",
    },
    {
        id: "summer-bright-meadow-fill",
        name: "Bright summer meadow fill",
        terrainType: "grass",
        solid: false,
        tags: ["summer", "grass", "meadow", "ground", "bright", "fill"],
        description: "A second seamless summer meadow fill with a brighter pattern variation for large lawns.",
    },
    {
        id: "summer-river-straight",
        name: "Summer river — straight",
        terrainType: "water",
        solid: true,
        tags: ["summer", "river", "water", "shore", "straight", "blocked"],
        description: "A multi-tile horizontal river section with animated-looking highlights and earthen banks.",
    },
    {
        id: "summer-river-bend",
        name: "Summer river — bend",
        terrainType: "water",
        solid: true,
        tags: ["summer", "river", "water", "shore", "bend", "blocked"],
        description: "A multi-tile curved river section for composing a flowing corner with earthen banks.",
    },
];

function patchTileIds(index: number): readonly number[] {
    const originColumn = (index % PATCH_COLUMNS) * PATCH_SIZE_IN_TILES;
    const originRow = CONTENT_START_ROW + Math.floor(index / PATCH_COLUMNS) * PATCH_SIZE_IN_TILES;
    return Array.from({ length: PATCH_SIZE_IN_TILES * PATCH_SIZE_IN_TILES }, (_, cell) => {
        const column = originColumn + (cell % PATCH_SIZE_IN_TILES);
        const row = originRow + Math.floor(cell / PATCH_SIZE_IN_TILES);
        return row * ATLAS_COLUMNS + column;
    });
}

function roadAutotile(start: number): TerrainAutotileTiles {
    return {
        topLeft: start,
        top: start + 1,
        topRight: start + 2,
        left: start + 3,
        center: start + 4,
        right: start + 5,
        bottomLeft: start + 6,
        bottom: start + 7,
        bottomRight: start + 8,
        innerTopLeft: start + 9,
        innerTopRight: start + 10,
        innerBottomLeft: start + 11,
        innerBottomRight: start + 12,
    };
}

const patchGroups: readonly BuiltInTerrainGroup[] = SUMMER_PATCHES.map((definition, index) => {
    const tileIds = patchTileIds(index);
    return {
        id: definition.id,
        name: definition.name,
        description: definition.description,
        terrainType: definition.terrainType,
        searchTerms: definition.tags.join(" "),
        tileIds,
        displayTileIds: tileIds,
        previewTileId: tileIds[36],
    };
});

const paleRoadStart = (CONTENT_START_ROW + 48) * ATLAS_COLUMNS;
const darkRoadStart = (CONTENT_START_ROW + 49) * ATLAS_COLUMNS;
const roadGroups: readonly BuiltInTerrainGroup[] = [
    {
        id: "summer-sandstone-path",
        name: "Summer sandstone path",
        description: "A complete thirteen-piece contour set for drawing pale sandstone village paths as shapes.",
        terrainType: "path",
        searchTerms: "summer path road sandstone pale village walkable contour",
        tileIds: Array.from({ length: 13 }, (_, index) => paleRoadStart + index),
        displayTileIds: Array.from({ length: 13 }, (_, index) => paleRoadStart + index),
        previewTileId: paleRoadStart + 4,
        autotile: roadAutotile(paleRoadStart),
    },
    {
        id: "summer-stone-path",
        name: "Summer stone path",
        description: "A complete thirteen-piece contour set for drawing dark cobbled village paths as shapes.",
        terrainType: "path",
        searchTerms: "summer path road stone cobble dark village walkable contour",
        tileIds: Array.from({ length: 13 }, (_, index) => darkRoadStart + index),
        displayTileIds: Array.from({ length: 13 }, (_, index) => darkRoadStart + index),
        previewTileId: darkRoadStart + 4,
        autotile: roadAutotile(darkRoadStart),
    },
];

const SUMMER_TERRAIN_GROUPS: readonly BuiltInTerrainGroup[] = [...patchGroups, ...roadGroups];

function makeAsset(group: BuiltInTerrainGroup, tileId: number, variant: number): BuiltInTerrainAsset {
    const row = Math.floor(tileId / ATLAS_COLUMNS);
    const column = tileId % ATLAS_COLUMNS;
    const name = `${group.name} — tile ${String(variant + 1).padStart(2, "0")}`;
    const tags = [
        "craftpix",
        "summer",
        group.terrainType,
        group.name.toLowerCase(),
        ...group.searchTerms.split(/\s+/u),
        `row ${row}`,
        `column ${column}`,
    ];
    return {
        id: `craftpix-summer-terrain:${tileId}`,
        tilesetId: "craftpix-summer-terrain",
        tileId,
        name,
        description: `${group.description} Native atlas coordinate: row ${row}, column ${column}; local tile ID ${tileId}.`,
        terrainType: group.terrainType,
        tags,
        solid: SUMMER_PATCHES.find((patch) => patch.id === group.id)?.solid ?? false,
        animated: false,
        family: group.name,
        atlasCoordinate: { column, row },
        searchText: [name, group.description, ...tags].join(" ").toLowerCase(),
    };
}

export const BUILT_IN_SUMMER_TERRAIN_ASSETS: readonly BuiltInTerrainAsset[] = SUMMER_TERRAIN_GROUPS.flatMap((group) =>
    group.tileIds.map((tileId, variant) => makeAsset(group, tileId, variant)),
);

export const BUILT_IN_SUMMER_TERRAIN_TILESET: BuiltInTerrainTileset = {
    id: "craftpix-summer-terrain",
    name: "Craftpix Summer terrain",
    image: IMAGE_URL,
    width: 1024,
    height: 2624,
    columns: ATLAS_COLUMNS,
    rows: 82,
    tileCount: 2624,
    groups: SUMMER_TERRAIN_GROUPS,
    matchesImage(image: string): boolean {
        return image.split(/[?#]/, 1)[0].endsWith(IMAGE_URL);
    },
};
