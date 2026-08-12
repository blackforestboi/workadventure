export const TERRAIN_SURFACE_CATALOG_VERSION = "2026-08-12.1";

export const TERRAIN_SURFACE_CATEGORIES = [
    "natural-ground",
    "water-wetland",
    "rock-underground",
    "built-surface",
    "frozen-hazard",
    "fantasy-otherworldly",
] as const;

export type TerrainSurfaceCategory = (typeof TERRAIN_SURFACE_CATEGORIES)[number];
export type TerrainAssetAvailability = "not-started" | "in-progress" | "available";
export type TerrainAssetReadiness = "not-started" | "partial" | "complete";
export type TerrainTraversalMode = "walk" | "swim" | "blocked" | "conditional";
export type TerrainCompositionMode = "patch" | "enclosure";
export type TerrainEffectType = "slippery" | "hazardous" | "current" | "sinking";
export type TerrainWaterKind = "still" | "flowing" | "whitewater" | "coastal" | "wetland" | "flooded";
export type TerrainWaterColor = "clear" | "blue" | "deep-blue" | "turquoise" | "green" | "brown" | "dark";
export type TerrainWaterWaveform =
    | "glass"
    | "small-ripples"
    | "directional-flow"
    | "choppy-waves"
    | "breaking-waves"
    | "foam";

export interface TerrainEffect {
    type: TerrainEffectType;
    /** Normalized metadata only. Runtime systems may interpret this later. */
    intensity: number;
}

export interface TerrainTraversal {
    mode: TerrainTraversalMode;
    /** Relative movement speed. Null means the surface is not directly traversable. */
    speedMultiplier: number | null;
    effects: readonly TerrainEffect[];
}

export const TERRAIN_SURFACE_SPRITE_ROLES = [
    "center",
    "edgeNorth",
    "edgeEast",
    "edgeSouth",
    "edgeWest",
    "externalCornerSmallNorthWest",
    "externalCornerSmallNorthEast",
    "externalCornerSmallSouthEast",
    "externalCornerSmallSouthWest",
    "externalCornerLargeNorthWest",
    "externalCornerLargeNorthEast",
    "externalCornerLargeSouthEast",
    "externalCornerLargeSouthWest",
    "internalCornerSmallNorthWest",
    "internalCornerSmallNorthEast",
    "internalCornerSmallSouthEast",
    "internalCornerSmallSouthWest",
    "internalCornerLargeNorthWest",
    "internalCornerLargeNorthEast",
    "internalCornerLargeSouthEast",
    "internalCornerLargeSouthWest",
] as const;

export type TerrainSurfaceSpriteRole = (typeof TERRAIN_SURFACE_SPRITE_ROLES)[number];

export interface TerrainSpriteRoleDefinition {
    id: TerrainSurfaceSpriteRole;
    kind: "fill" | "edge" | "corner";
    boundary: "none" | "external" | "internal";
    curvature: "none" | "small" | "large";
}

export interface TerrainSpriteTemplateProfile {
    id: "surface-32-v1" | "water-fill-32-v1";
    tileWidth: 32;
    tileHeight: 32;
    compositionModes: readonly TerrainCompositionMode[];
    roles: readonly TerrainSpriteRoleDefinition[];
}

export interface TerrainAtlasTileSource {
    kind: "built-in-atlas-tile";
    tilesetId: "workadventure-lpc-outdoor-terrain";
    familyId: string;
    tileId: number;
}

export interface TerrainSpriteAsset {
    role: TerrainSurfaceSpriteRole;
    availability: TerrainAssetAvailability;
    source?: TerrainAtlasTileSource;
}

export interface TerrainSpecialSpriteAsset {
    id: string;
    description: string;
    availability: TerrainAssetAvailability;
    source?: TerrainAtlasTileSource;
}

export interface TerrainSurfaceAssets {
    readiness: TerrainAssetReadiness;
    hasAnyAvailableAssets: boolean;
    templateProfileId: TerrainSpriteTemplateProfile["id"];
    roles: readonly TerrainSpriteAsset[];
    /** Surface-specific extras such as cracks or directional flow; never props such as boulders or plants. */
    special: readonly TerrainSpecialSpriteAsset[];
}

/** The visual identity of water. The terrain surrounding it owns any shoreline or riverbank edge. */
export interface TerrainWaterAppearance {
    kind: TerrainWaterKind;
    color: TerrainWaterColor;
    waveform: TerrainWaterWaveform;
    boundaryOwner: "environment";
}

export interface TerrainSurface {
    id: string;
    name: string;
    description: string;
    category: TerrainSurfaceCategory;
    tags: readonly string[];
    traversal: TerrainTraversal;
    assets: TerrainSurfaceAssets;
    /** Present only for water and wetland surfaces rendered as a boundary-free water fill. */
    waterAppearance?: TerrainWaterAppearance;
    /** Whether this surface may use the future generic blend treatment beside another mixable surface. */
    mixable: boolean;
    /** False until every required template role has an available source. */
    editorEligible: boolean;
    searchText: string;
}

export interface TerrainSurfaceSearch {
    query?: string;
    category?: TerrainSurfaceCategory;
    readiness?: TerrainAssetReadiness;
    traversal?: TerrainTraversalMode;
    effect?: TerrainEffectType;
    templateProfile?: TerrainSpriteTemplateProfile["id"];
}

const roleDefinition = (id: TerrainSurfaceSpriteRole): TerrainSpriteRoleDefinition => ({
    id,
    kind: id === "center" ? "fill" : id.startsWith("edge") ? "edge" : "corner",
    boundary: id.startsWith("external") ? "external" : id.startsWith("internal") ? "internal" : "none",
    curvature: id.includes("Small") ? "small" : id.includes("Large") ? "large" : "none",
});

export const TERRAIN_SPRITE_TEMPLATE_PROFILES: readonly TerrainSpriteTemplateProfile[] = [
    {
        id: "surface-32-v1",
        tileWidth: 32,
        tileHeight: 32,
        compositionModes: ["patch", "enclosure"],
        roles: TERRAIN_SURFACE_SPRITE_ROLES.map(roleDefinition),
    },
    {
        id: "water-fill-32-v1",
        tileWidth: 32,
        tileHeight: 32,
        compositionModes: ["patch", "enclosure"],
        roles: [roleDefinition("center")],
    },
];

interface SurfaceGroupDefinition {
    category: TerrainSurfaceCategory;
    names: readonly string[];
}

const SURFACE_GROUPS: readonly SurfaceGroupDefinition[] = [
    {
        category: "natural-ground",
        names: [
            "Short turf",
            "Tall grass",
            "Wildflower meadow",
            "Prairie sod",
            "Steppe grass",
            "Savanna grass",
            "Heather moor",
            "Moss-and-lichen ground",
            "Forest floor",
            "Leaf litter",
            "Pine needles",
            "Packed earth",
            "Loose earth",
            "Hardpan",
            "Cracked earth",
            "Clay pan",
            "Peat ground",
            "Loam",
            "Fine sand",
            "Coarse sand",
            "Dune sand",
            "Shingle beach",
            "Gravel",
            "Pebble field",
            "Salt flat",
            "Badlands soil",
            "Farm soil",
            "Pasture",
            "Orchard ground",
            "Vineyard rows",
            "Rice paddy",
            "Reed bed",
            "Sedge meadow",
            "Dry scrub",
            "Thorn scrub",
            "Chaparral ground",
            "Bracken ground",
            "Fern understory",
            "Bamboo-grove ground",
            "Jungle understory",
        ],
    },
    {
        category: "water-wetland",
        names: [
            "Puddle",
            "Shallow stream",
            "Deep stream",
            "River ford",
            "River channel",
            "Rapids",
            "Waterfall lip",
            "Pond",
            "Vernal pool",
            "Lake shallows",
            "Lake depths",
            "Reservoir",
            "Canal water",
            "Coastal shallows",
            "Open sea",
            "Tidal flat",
            "Tidal creek",
            "Tide pool",
            "Lagoon",
            "Estuary",
            "River delta",
            "Coral reef",
            "Seagrass bed",
            "Kelp bed",
            "Freshwater marsh",
            "Salt marsh",
            "Swamp water",
            "Bog pool",
            "Fen",
            "Mudflat",
            "Muddy riverbank",
            "Flooded grassland",
            "Flooded forest",
            "Mangrove mud",
        ],
    },
    {
        category: "rock-underground",
        names: [
            "Smooth bedrock",
            "Rock slab",
            "Slick rock",
            "Fractured rock",
            "Granite slab",
            "Sandstone shelf",
            "Limestone pavement",
            "Basalt plain",
            "Obsidian field",
            "Rock outcrop",
            "Rock-strewn ground",
            "Scree slope",
            "Talus fan",
            "Glacial moraine",
            "Mountain slope",
            "Hill crest",
            "Plateau top",
            "Mesa top",
            "Valley floor",
            "Canyon floor",
            "Gorge floor",
            "Ravine floor",
            "Karst sinkhole",
            "Volcanic ash",
            "Cinder field",
            "Lava crust",
            "Molten lava",
            "Geothermal basin",
            "Geyser field",
            "Travertine terrace",
            "Natural cave floor",
            "Limestone cavern",
            "Basalt cavern",
            "Crystal cavern floor",
            "Volcanic tube",
            "Grotto sand",
            "Dripstone chamber",
            "Root-choked tunnel",
            "Deep chasm ledge",
        ],
    },
    {
        category: "built-surface",
        names: [
            "Dirt trail",
            "Gravel lane",
            "Cobblestone street",
            "Flagstone path",
            "Brick pavement",
            "Asphalt road",
            "Road shoulder",
            "Rail bed",
            "Station platform",
            "Boardwalk planks",
            "Wooden bridge deck",
            "Stone bridge deck",
            "Metal catwalk",
            "Steel grating",
            "Sewer walkway",
            "Sewer channel bed",
            "Rooftop tar",
            "Rooftop tiles",
            "Courtyard mosaic",
            "Marble floor",
            "Stone floor",
            "Wood-plank floor",
            "Ceramic tile",
            "Carpet",
            "Rough concrete",
            "Polished concrete",
            "Factory floor",
            "Warehouse floor",
            "Spaceship hull plating",
            "Terraforming mesh",
            "Nanite-metal ground",
        ],
    },
    {
        category: "frozen-hazard",
        names: [
            "Packed snow",
            "Powder snow",
            "Wind-scoured snow",
            "Slush",
            "Sheet ice",
            "Frozen lake",
            "Glacier ice",
            "Sea ice",
            "Crevasse rim",
            "Avalanche debris",
            "Landslide debris",
            "Quicksand",
            "Deep mud",
            "Tar pit",
            "Acid-pool edge",
            "Toxic sludge",
            "Radioactive waste ground",
            "Burning coals",
            "Scorched earth",
            "Siege-scorched paving",
            "Razor-rock field",
            "Thorny bramble ground",
            "Electrified floor",
            "Void/chasm",
        ],
    },
    {
        category: "fantasy-otherworldly",
        names: [
            "Broken flagstones",
            "Overgrown paving",
            "Collapsed masonry",
            "Sunken courtyard",
            "Weathered temple floor",
            "Carved stone dais",
            "Ancient road",
            "Mosaic ruin",
            "Crumbling brickwork",
            "Rubble field",
            "Shattered marble",
            "Archaeological trench",
            "Buried city street",
            "Forgotten shrine floor",
            "Catacomb floor",
            "Crypt floor",
            "Ossuary floor",
            "Glowing mushroom floor",
            "Bioluminescent moss",
            "Fairy-ring grass",
            "Enchanted flower field",
            "Corrupted blight",
            "Bone field",
            "Blood-soaked earth",
            "Shadow-mist floor",
            "Dream-cloud surface",
            "Starfield void",
            "Floating-island soil",
            "Aether crystal plain",
            "Mana-veined stone",
            "Arcane rune floor",
            "Portal residue ground",
            "Alien biomass",
            "Iridescent alien sand",
            "Zero-gravity platform",
        ],
    },
];

const surfaceId = (name: string): string =>
    name
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

const LEGACY_ROLE_KEYS: Readonly<Partial<Record<TerrainSurfaceSpriteRole, string>>> = {
    center: "center",
    edgeNorth: "top",
    edgeEast: "right",
    edgeSouth: "bottom",
    edgeWest: "left",
    externalCornerSmallNorthWest: "topLeft",
    externalCornerSmallNorthEast: "topRight",
    externalCornerSmallSouthEast: "bottomRight",
    externalCornerSmallSouthWest: "bottomLeft",
    internalCornerSmallNorthWest: "innerTopLeft",
    internalCornerSmallNorthEast: "innerTopRight",
    internalCornerSmallSouthEast: "innerBottomRight",
    internalCornerSmallSouthWest: "innerBottomLeft",
};

interface LegacyAutotileBinding {
    familyId: string;
    tiles: Readonly<Record<string, number>>;
}

const LEGACY_BINDINGS: Readonly<Record<string, LegacyAutotileBinding>> = {
    "packed-earth": {
        familyId: "light-dirt",
        tiles: {
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
    },
    loam: {
        familyId: "dark-dirt",
        tiles: {
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
    },
    "short-turf": {
        familyId: "meadow-grass",
        tiles: {
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
    },
    pond: {
        familyId: "water",
        tiles: {
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
    },
};

/**
 * Mixability is deliberately a property of one surface, not a relationship between
 * named pairs. Future rendering can blend any two adjacent mixable surfaces.
 */
const MIXABLE_SURFACE_IDS = new Set([
    "short-turf",
    "tall-grass",
    "wildflower-meadow",
    "prairie-sod",
    "steppe-grass",
    "savanna-grass",
    "heather-moor",
    "moss-and-lichen-ground",
    "forest-floor",
    "leaf-litter",
    "pine-needles",
    "packed-earth",
    "loose-earth",
    "hardpan",
    "cracked-earth",
    "clay-pan",
    "peat-ground",
    "loam",
    "fine-sand",
    "coarse-sand",
    "dune-sand",
    "shingle-beach",
    "gravel",
    "pebble-field",
    "salt-flat",
    "badlands-soil",
    "farm-soil",
    "pasture",
    "orchard-ground",
    "sedge-meadow",
    "dry-scrub",
    "thorn-scrub",
    "chaparral-ground",
    "bracken-ground",
    "fern-understory",
    "bamboo-grove-ground",
    "jungle-understory",
    "smooth-bedrock",
    "rock-slab",
    "slick-rock",
    "fractured-rock",
    "granite-slab",
    "sandstone-shelf",
    "limestone-pavement",
    "basalt-plain",
    "obsidian-field",
    "rock-strewn-ground",
    "scree-slope",
    "talus-fan",
    "glacial-moraine",
    "mountain-slope",
    "hill-crest",
    "plateau-top",
    "mesa-top",
    "valley-floor",
    "canyon-floor",
    "gorge-floor",
    "ravine-floor",
    "volcanic-ash",
    "cinder-field",
    "lava-crust",
    "travertine-terrace",
    "natural-cave-floor",
    "limestone-cavern",
    "basalt-cavern",
    "crystal-cavern-floor",
    "volcanic-tube",
    "grotto-sand",
    "dripstone-chamber",
    "root-choked-tunnel",
    "dirt-trail",
    "gravel-lane",
    "road-shoulder",
    "rough-concrete",
    "packed-snow",
    "powder-snow",
    "wind-scoured-snow",
    "slush",
    "avalanche-debris",
    "landslide-debris",
    "scorched-earth",
    "rubble-field",
    "bioluminescent-moss",
    "fairy-ring-grass",
    "enchanted-flower-field",
    "floating-island-soil",
    "aether-crystal-plain",
    "mana-veined-stone",
    "portal-residue-ground",
    "alien-biomass",
    "iridescent-alien-sand",
]);

const BLOCKED_SURFACES = new Set(["waterfall-lip", "molten-lava", "deep-chasm-ledge", "void-chasm", "starfield-void"]);
const WALKABLE_WET_SURFACES = new Set([
    "puddle",
    "shallow-stream",
    "river-ford",
    "tidal-flat",
    "freshwater-marsh",
    "salt-marsh",
    "fen",
    "mudflat",
    "muddy-riverbank",
    "flooded-grassland",
    "mangrove-mud",
]);
const CONDITIONAL_SURFACES = new Set([
    "rapids",
    "quicksand",
    "tar-pit",
    "acid-pool-edge",
    "toxic-sludge",
    "radioactive-waste-ground",
    "electrified-floor",
    "shadow-mist-floor",
    "dream-cloud-surface",
    "zero-gravity-platform",
]);
const SLIPPERY_SURFACES = new Set([
    "slick-rock",
    "sheet-ice",
    "frozen-lake",
    "glacier-ice",
    "sea-ice",
    "polished-concrete",
    "dream-cloud-surface",
]);
const CURRENT_SURFACES = new Set([
    "shallow-stream",
    "deep-stream",
    "river-channel",
    "rapids",
    "tidal-creek",
    "estuary",
    "river-delta",
]);
const SINKING_SURFACES = new Set(["quicksand", "deep-mud", "tar-pit", "bog-pool"]);
const HAZARDOUS_SURFACES = new Set([
    "waterfall-lip",
    "molten-lava",
    "geothermal-basin",
    "geyser-field",
    "crevasse-rim",
    "quicksand",
    "tar-pit",
    "acid-pool-edge",
    "toxic-sludge",
    "radioactive-waste-ground",
    "burning-coals",
    "razor-rock-field",
    "thorny-bramble-ground",
    "electrified-floor",
    "void-chasm",
    "corrupted-blight",
    "blood-soaked-earth",
    "starfield-void",
]);

const WATER_APPEARANCES: Readonly<Record<string, TerrainWaterAppearance>> = {
    puddle: { kind: "still", color: "brown", waveform: "small-ripples", boundaryOwner: "environment" },
    "shallow-stream": { kind: "flowing", color: "clear", waveform: "directional-flow", boundaryOwner: "environment" },
    "deep-stream": { kind: "flowing", color: "blue", waveform: "directional-flow", boundaryOwner: "environment" },
    "river-ford": { kind: "flowing", color: "clear", waveform: "small-ripples", boundaryOwner: "environment" },
    "river-channel": { kind: "flowing", color: "blue", waveform: "directional-flow", boundaryOwner: "environment" },
    rapids: { kind: "whitewater", color: "blue", waveform: "foam", boundaryOwner: "environment" },
    "waterfall-lip": { kind: "whitewater", color: "blue", waveform: "foam", boundaryOwner: "environment" },
    pond: { kind: "still", color: "blue", waveform: "small-ripples", boundaryOwner: "environment" },
    "vernal-pool": { kind: "still", color: "brown", waveform: "glass", boundaryOwner: "environment" },
    "lake-shallows": { kind: "still", color: "turquoise", waveform: "small-ripples", boundaryOwner: "environment" },
    "lake-depths": { kind: "still", color: "deep-blue", waveform: "small-ripples", boundaryOwner: "environment" },
    reservoir: { kind: "still", color: "blue", waveform: "small-ripples", boundaryOwner: "environment" },
    "canal-water": { kind: "flowing", color: "blue", waveform: "directional-flow", boundaryOwner: "environment" },
    "coastal-shallows": { kind: "coastal", color: "turquoise", waveform: "choppy-waves", boundaryOwner: "environment" },
    "open-sea": { kind: "coastal", color: "deep-blue", waveform: "breaking-waves", boundaryOwner: "environment" },
    "tidal-flat": { kind: "coastal", color: "brown", waveform: "small-ripples", boundaryOwner: "environment" },
    "tidal-creek": { kind: "flowing", color: "brown", waveform: "directional-flow", boundaryOwner: "environment" },
    "tide-pool": { kind: "coastal", color: "turquoise", waveform: "small-ripples", boundaryOwner: "environment" },
    lagoon: { kind: "coastal", color: "turquoise", waveform: "small-ripples", boundaryOwner: "environment" },
    estuary: { kind: "flowing", color: "brown", waveform: "directional-flow", boundaryOwner: "environment" },
    "river-delta": { kind: "flowing", color: "brown", waveform: "directional-flow", boundaryOwner: "environment" },
    "coral-reef": { kind: "coastal", color: "turquoise", waveform: "choppy-waves", boundaryOwner: "environment" },
    "seagrass-bed": { kind: "coastal", color: "green", waveform: "small-ripples", boundaryOwner: "environment" },
    "kelp-bed": { kind: "coastal", color: "green", waveform: "choppy-waves", boundaryOwner: "environment" },
    "freshwater-marsh": { kind: "wetland", color: "green", waveform: "small-ripples", boundaryOwner: "environment" },
    "salt-marsh": { kind: "wetland", color: "brown", waveform: "small-ripples", boundaryOwner: "environment" },
    "swamp-water": { kind: "wetland", color: "dark", waveform: "glass", boundaryOwner: "environment" },
    "bog-pool": { kind: "wetland", color: "dark", waveform: "glass", boundaryOwner: "environment" },
    fen: { kind: "wetland", color: "green", waveform: "small-ripples", boundaryOwner: "environment" },
    mudflat: { kind: "wetland", color: "brown", waveform: "glass", boundaryOwner: "environment" },
    "muddy-riverbank": { kind: "wetland", color: "brown", waveform: "small-ripples", boundaryOwner: "environment" },
    "flooded-grassland": { kind: "flooded", color: "green", waveform: "small-ripples", boundaryOwner: "environment" },
    "flooded-forest": { kind: "flooded", color: "dark", waveform: "small-ripples", boundaryOwner: "environment" },
    "mangrove-mud": { kind: "wetland", color: "brown", waveform: "small-ripples", boundaryOwner: "environment" },
};

const movementSpeed = (id: string, category: TerrainSurfaceCategory): number => {
    if (id.includes("mud") || id.includes("marsh") || id === "fen" || id.includes("swamp")) return 0.55;
    if (id.includes("powder-snow") || id.includes("debris") || id.includes("scree") || id.includes("talus"))
        return 0.65;
    if (id.includes("sand") || id.includes("gravel") || id.includes("scrub") || id.includes("understory")) return 0.8;
    if (id.includes("grass") || id.includes("meadow") || id.includes("moss") || id.includes("litter")) return 0.9;
    if (category === "water-wetland") return 0.6;
    return 1;
};

const traversalFor = (id: string, category: TerrainSurfaceCategory): TerrainTraversal => {
    const mode: TerrainTraversalMode = BLOCKED_SURFACES.has(id)
        ? "blocked"
        : CONDITIONAL_SURFACES.has(id)
          ? "conditional"
          : category === "water-wetland" && !WALKABLE_WET_SURFACES.has(id)
            ? "swim"
            : "walk";
    const effects: TerrainEffect[] = [];
    if (SLIPPERY_SURFACES.has(id)) effects.push({ type: "slippery", intensity: 0.8 });
    if (HAZARDOUS_SURFACES.has(id)) effects.push({ type: "hazardous", intensity: 1 });
    if (CURRENT_SURFACES.has(id)) effects.push({ type: "current", intensity: id === "rapids" ? 1 : 0.5 });
    if (SINKING_SURFACES.has(id)) effects.push({ type: "sinking", intensity: 0.8 });
    return { mode, speedMultiplier: mode === "blocked" ? null : movementSpeed(id, category), effects };
};

const spriteAssetsFor = (id: string, isWater: boolean): TerrainSurfaceAssets => {
    const binding = LEGACY_BINDINGS[id];
    const requiredRoles = isWater ? (["center"] as const) : TERRAIN_SURFACE_SPRITE_ROLES;
    const roles = requiredRoles.map((role): TerrainSpriteAsset => {
        const legacyRole = LEGACY_ROLE_KEYS[role];
        const tileId = binding !== undefined && legacyRole !== undefined ? binding.tiles[legacyRole] : undefined;
        return tileId === undefined
            ? { role, availability: "not-started" }
            : {
                  role,
                  availability: "available",
                  source: {
                      kind: "built-in-atlas-tile",
                      tilesetId: "workadventure-lpc-outdoor-terrain",
                      familyId: binding.familyId,
                      tileId,
                  },
              };
    });
    const availableCount = roles.filter((role) => role.availability === "available").length;
    return {
        readiness: availableCount === 0 ? "not-started" : availableCount === roles.length ? "complete" : "partial",
        hasAnyAvailableAssets: availableCount > 0,
        templateProfileId: isWater ? "water-fill-32-v1" : "surface-32-v1",
        roles,
        special: [],
    };
};

const makeSurface = (category: TerrainSurfaceCategory, name: string): TerrainSurface => {
    const id = surfaceId(name);
    const tags = [
        ...new Set([
            ...name
                .toLowerCase()
                .split(/[^a-z0-9]+/)
                .filter(Boolean),
            category,
        ]),
    ];
    const waterAppearance = WATER_APPEARANCES[id];
    const assets = spriteAssetsFor(id, waterAppearance !== undefined);
    return {
        id,
        name,
        description: `${name} as a continuous 32×32 terrain surface. Discrete vegetation, boulders, structures, and other props are intentionally separate assets.`,
        category,
        tags,
        traversal: traversalFor(id, category),
        assets,
        waterAppearance,
        mixable: MIXABLE_SURFACE_IDS.has(id),
        editorEligible: assets.readiness === "complete",
        searchText: [name, category, ...tags].join(" ").toLowerCase(),
    };
};

export const TERRAIN_SURFACES: readonly TerrainSurface[] = SURFACE_GROUPS.flatMap((group) =>
    group.names.map((name) => makeSurface(group.category, name)),
);

export function getTerrainSurface(id: string): TerrainSurface | undefined {
    return TERRAIN_SURFACES.find((surface) => surface.id === id);
}

export function getTerrainSurfaceSpriteRequirements(id: string): readonly TerrainSpriteAsset[] | undefined {
    return getTerrainSurface(id)?.assets.roles;
}

export function searchTerrainSurfaces(search: TerrainSurfaceSearch = {}): readonly TerrainSurface[] {
    const queryTokens = (search.query ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    return TERRAIN_SURFACES.filter(
        (surface) =>
            (search.category === undefined || surface.category === search.category) &&
            (search.readiness === undefined || surface.assets.readiness === search.readiness) &&
            (search.traversal === undefined || surface.traversal.mode === search.traversal) &&
            (search.effect === undefined ||
                surface.traversal.effects.some((effect) => effect.type === search.effect)) &&
            (search.templateProfile === undefined || surface.assets.templateProfileId === search.templateProfile) &&
            queryTokens.every((token) => surface.searchText.includes(token)),
    );
}

export function validateTerrainSurfaceCatalog(): readonly string[] {
    const issues: string[] = [];
    const ids = new Set(TERRAIN_SURFACES.map((surface) => surface.id));
    if (ids.size !== TERRAIN_SURFACES.length) issues.push("Surface IDs must be unique.");
    for (const surface of TERRAIN_SURFACES) {
        const expectedRoleCount = surface.waterAppearance === undefined ? TERRAIN_SURFACE_SPRITE_ROLES.length : 1;
        if (surface.assets.roles.length !== expectedRoleCount) {
            issues.push(`${surface.id} does not outline every required sprite role.`);
        }
        if (surface.traversal.mode === "blocked" && surface.traversal.speedMultiplier !== null) {
            issues.push(`${surface.id} is blocked but has a movement speed.`);
        }
        if (surface.category === "water-wetland" && surface.waterAppearance === undefined) {
            issues.push(`${surface.id} must define its water appearance.`);
        }
        if (surface.category !== "water-wetland" && surface.waterAppearance !== undefined) {
            issues.push(`${surface.id} has water appearance outside the water and wetland category.`);
        }
        if (surface.waterAppearance !== undefined && surface.assets.templateProfileId !== "water-fill-32-v1") {
            issues.push(`${surface.id} must use the boundary-free water fill template.`);
        }
        if (surface.category === "water-wetland" && surface.mixable) {
            issues.push(`${surface.id} is water or wetland and cannot use the generic surface blend.`);
        }
    }
    return issues;
}

const catalogIssues = validateTerrainSurfaceCatalog();
if (catalogIssues.length > 0) throw new Error(`Invalid terrain surface catalog: ${catalogIssues.join(" ")}`);
