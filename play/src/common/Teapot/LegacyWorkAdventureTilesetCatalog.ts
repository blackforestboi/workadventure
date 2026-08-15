export type LegacyWorkAdventureTilesetCategory =
    | "Walls"
    | "Floors"
    | "Furniture"
    | "Signage"
    | "Decorations"
    | "Streets"
    | "Branding"
    | "Tilesets";

export interface LegacyWorkAdventureTileset {
    id: string;
    name: string;
    category: LegacyWorkAdventureTilesetCategory;
    source: string;
    image: string;
    width: number;
    height: number;
    columns: number;
    rows: number;
    tileCount: number;
    searchTerms: string;
    attribution: string;
    matchesImage(image: string): boolean;
}

interface LegacyWorkAdventureTilesetDefinition {
    id: string;
    name: string;
    category: LegacyWorkAdventureTilesetCategory;
    source: string;
    image: string;
    width: number;
    height: number;
    searchTerms: string;
}

const TILE_SIZE = 32;
const ATTRIBUTION = "WorkAdventure legacy map assets · CC BY-SA 3.0 / GPL 3.0";

function createTileset(definition: LegacyWorkAdventureTilesetDefinition): LegacyWorkAdventureTileset {
    const columns = definition.width / TILE_SIZE;
    const rows = definition.height / TILE_SIZE;
    if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
        throw new Error(`Legacy tileset ${definition.id} must use a ${TILE_SIZE}px grid.`);
    }

    return {
        ...definition,
        columns,
        rows,
        tileCount: columns * rows,
        attribution: ATTRIBUTION,
        matchesImage(image: string): boolean {
            return image.split(/[?#]/, 1)[0].endsWith(definition.image);
        },
    };
}

export const LEGACY_WORKADVENTURE_TILESETS: readonly LegacyWorkAdventureTileset[] = [
    createTileset({
        id: "legacy-floor0-desks",
        name: "Office desks",
        category: "Furniture",
        source: "Floor 0",
        image: "/collections/WorkAdventureLegacy/assets/Floor0/desks.png",
        width: 320,
        height: 352,
        searchTerms: "legacy floor 0 office desks furniture interior workadventure",
    }),
    createTileset({
        id: "legacy-floor0-floor",
        name: "Office floor tiles",
        category: "Floors",
        source: "Floor 0",
        image: "/collections/WorkAdventureLegacy/assets/Floor0/floortileset.png",
        width: 256,
        height: 256,
        searchTerms: "legacy floor 0 floor tiles interior workadventure",
    }),
    createTileset({
        id: "legacy-floor0-logo",
        name: "Teapot logo tiles",
        category: "Branding",
        source: "Floor 0",
        image: "/collections/WorkAdventureLegacy/assets/Floor0/logotcm.png",
        width: 64,
        height: 32,
        searchTerms: "legacy floor 0 logo tcm branding workadventure",
    }),
    createTileset({
        id: "legacy-floor0-signage",
        name: "Office signage",
        category: "Signage",
        source: "Floor 0",
        image: "/collections/WorkAdventureLegacy/assets/Floor0/signages.png",
        width: 256,
        height: 192,
        searchTerms: "legacy floor 0 signs signage interior workadventure",
    }),
    createTileset({
        id: "legacy-floor0-deviant",
        name: "Interior tiles",
        category: "Tilesets",
        source: "Floor 0",
        image: "/collections/WorkAdventureLegacy/assets/Floor0/tilesets_deviant_milkian_1.png",
        width: 512,
        height: 512,
        searchTerms: "legacy floor 0 interior tileset deviant milkian workadventure",
    }),
    createTileset({
        id: "legacy-floor0-walls",
        name: "Legacy walls",
        category: "Walls",
        source: "Floor 0",
        image: "/collections/WorkAdventureLegacy/assets/Floor0/walls.png",
        width: 512,
        height: 480,
        searchTerms: "legacy wall walls floor 0 interior workadventure",
    }),
    createTileset({
        id: "legacy-floor0-walls2",
        name: "Legacy walls 2",
        category: "Walls",
        source: "Floor 0",
        image: "/collections/WorkAdventureLegacy/assets/Floor0/walls2.png",
        width: 512,
        height: 512,
        searchTerms: "legacy wall walls floor 0 interior workadventure",
    }),
    createTileset({
        id: "legacy-floor0-xmas",
        name: "Holiday decorations",
        category: "Decorations",
        source: "Floor 0",
        image: "/collections/WorkAdventureLegacy/assets/Floor0/xmas.png",
        width: 256,
        height: 384,
        searchTerms: "legacy floor 0 holiday christmas xmas decorations workadventure",
    }),
    createTileset({
        id: "legacy-floor1-floor",
        name: "Floor tile pattern",
        category: "Floors",
        source: "Floor 1",
        image: "/collections/WorkAdventureLegacy/assets/Floor1/FloorTile_S.jpg",
        width: 64,
        height: 64,
        searchTerms: "legacy floor 1 floor tile pattern workadventure",
    }),
    createTileset({
        id: "legacy-floor1-floor-tiles",
        name: "Office floor tiles",
        category: "Floors",
        source: "Floor 1",
        image: "/collections/WorkAdventureLegacy/assets/Floor1/floortileset.png",
        width: 256,
        height: 256,
        searchTerms: "legacy floor 1 floor tiles interior workadventure",
    }),
    createTileset({
        id: "legacy-floor1-parquet",
        name: "Parquet floor",
        category: "Floors",
        source: "Floor 1",
        image: "/collections/WorkAdventureLegacy/assets/Floor1/parquet.png",
        width: 128,
        height: 128,
        searchTerms: "legacy floor 1 parquet wood floor workadventure",
    }),
    createTileset({
        id: "legacy-floor1-deviant",
        name: "Interior tiles",
        category: "Tilesets",
        source: "Floor 1",
        image: "/collections/WorkAdventureLegacy/assets/Floor1/tilesets_deviant_milkian_1.png",
        width: 512,
        height: 512,
        searchTerms: "legacy floor 1 interior tileset deviant milkian workadventure",
    }),
    createTileset({
        id: "legacy-floor1-streets",
        name: "Urban streets",
        category: "Streets",
        source: "Floor 1",
        image: "/collections/WorkAdventureLegacy/assets/Floor1/urban_streets.png",
        width: 512,
        height: 512,
        searchTerms: "legacy floor 1 urban streets road pavement workadventure",
    }),
    createTileset({
        id: "legacy-floor2-floor",
        name: "Office floor tiles",
        category: "Floors",
        source: "Floor 2",
        image: "/collections/WorkAdventureLegacy/assets/Floor2/floortileset.png",
        width: 256,
        height: 256,
        searchTerms: "legacy floor 2 floor tiles interior workadventure",
    }),
    createTileset({
        id: "legacy-floor2-general",
        name: "General interior tiles",
        category: "Tilesets",
        source: "Floor 2",
        image: "/collections/WorkAdventureLegacy/assets/Floor2/general.png",
        width: 512,
        height: 512,
        searchTerms: "legacy floor 2 general interior tiles workadventure",
    }),
    createTileset({
        id: "legacy-floor2-parquet",
        name: "Parquet floor",
        category: "Floors",
        source: "Floor 2",
        image: "/collections/WorkAdventureLegacy/assets/Floor2/parquet.png",
        width: 128,
        height: 128,
        searchTerms: "legacy floor 2 parquet wood floor workadventure",
    }),
    createTileset({
        id: "legacy-floor2-deviant",
        name: "Interior tiles",
        category: "Tilesets",
        source: "Floor 2",
        image: "/collections/WorkAdventureLegacy/assets/Floor2/tilesets_deviant_milkian_1.png",
        width: 512,
        height: 512,
        searchTerms: "legacy floor 2 interior tileset deviant milkian workadventure",
    }),
    createTileset({
        id: "legacy-lyon-floor",
        name: "Lyon floor tiles",
        category: "Floors",
        source: "Lyon",
        image: "/collections/WorkAdventureLegacy/assets/Lyon/floortileset.png",
        width: 256,
        height: 256,
        searchTerms: "legacy lyon floor tiles workadventure",
    }),
    createTileset({
        id: "legacy-lyon-deviant",
        name: "Lyon interior tiles",
        category: "Tilesets",
        source: "Lyon",
        image: "/collections/WorkAdventureLegacy/assets/Lyon/tilesets_deviant_milkian_1.png",
        width: 512,
        height: 512,
        searchTerms: "legacy lyon interior tileset deviant milkian workadventure",
    }),
];
