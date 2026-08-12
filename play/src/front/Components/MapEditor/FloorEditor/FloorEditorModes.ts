import type { MapEditorFloorLayer } from "../../../Stores/MapEditorFloorStore";

export const TERRAIN_MODE_DEFINITIONS = [
    { id: "pointer", label: "Pointer" },
    { id: "floor", label: "Floor" },
    { id: "elevation", label: "Elevation" },
    { id: "eraser", label: "Eraser" },
    { id: "collision", label: "Collision 1" },
    { id: "exit", label: "Exit" },
    { id: "start", label: "Start 1" },
    { id: "walls", label: "Walls" },
] as const;

export type TerrainModeId = (typeof TERRAIN_MODE_DEFINITIONS)[number]["id"];
export type AuthoringPathModeId = Extract<TerrainModeId, "collision" | "exit" | "start">;

export interface TerrainModeOption {
    id: TerrainModeId;
    label: string;
    layer: string | undefined;
}

export interface AuthoringPathTool {
    id: AuthoringPathModeId;
    addLabel: string;
    addDescription: string;
    removeLabel: string;
    removeDescription: string;
}

const LAYER_ALIASES: Readonly<Record<Exclude<TerrainModeId, "pointer" | "eraser">, ReadonlySet<string>>> = {
    collision: new Set(["collision", "collisions", "collision1", "collisions1"]),
    floor: new Set(["floor"]),
    elevation: new Set(["floor"]),
    exit: new Set(["exit"]),
    start: new Set(["start", "start1"]),
    walls: new Set(["wall", "walls"]),
};

export function getTerrainModeOptions(layers: readonly MapEditorFloorLayer[]): readonly TerrainModeOption[] {
    return TERRAIN_MODE_DEFINITIONS.map((definition) => ({
        ...definition,
        layer:
            definition.id === "pointer" || definition.id === "eraser"
                ? ""
                : layers.find((layer) => LAYER_ALIASES[definition.id].has(normalizeLayerName(layer.name)))?.name,
    }));
}

export function getActiveTerrainModeId(
    modes: readonly TerrainModeOption[],
    selectedLayer: string,
    selectedGid: number,
    toolMode: "tile" | "shape" | "elevation" = "tile",
): TerrainModeId {
    if (selectedLayer === "") return "pointer";
    if (toolMode === "elevation") return "elevation";
    const layerMode = modes.find(
        (mode) => mode.id !== "pointer" && mode.id !== "eraser" && mode.layer === selectedLayer,
    );
    if (layerMode !== undefined && isAuthoringPathMode(layerMode.id)) return layerMode.id;
    return selectedGid === 0 ? "eraser" : (layerMode?.id ?? "pointer");
}

export function isAuthoringPathMode(mode: TerrainModeId): mode is AuthoringPathModeId {
    return mode === "collision" || mode === "exit" || mode === "start";
}

export function isTerrainAssetBrowserMode(mode: TerrainModeId): boolean {
    return mode === "pointer" || mode === "floor";
}

const AUTHORING_PATH_TOOLS: Readonly<Record<AuthoringPathTool["id"], AuthoringPathTool>> = {
    collision: {
        id: "collision",
        addLabel: "Add collision",
        addDescription: "Block this cell",
        removeLabel: "Remove collision",
        removeDescription: "Keep every tile",
    },
    exit: {
        id: "exit",
        addLabel: "Add exit",
        addDescription: "Mark this cell",
        removeLabel: "Remove exit",
        removeDescription: "Clear this exit",
    },
    start: {
        id: "start",
        addLabel: "Add start",
        addDescription: "Spawn here",
        removeLabel: "Remove start",
        removeDescription: "Clear this start",
    },
};

export function getActiveAuthoringPathTool(
    modes: readonly TerrainModeOption[],
    selectedLayer: string,
): AuthoringPathTool | undefined {
    const activeMode = modes.find((mode) => mode.layer === selectedLayer);
    return activeMode !== undefined && isAuthoringPathMode(activeMode.id)
        ? AUTHORING_PATH_TOOLS[activeMode.id]
        : undefined;
}

export function resolveTerrainModeBrushGid(
    selectedGid: number,
    tilesets: readonly { tileGids: readonly number[] }[],
): number {
    if (selectedGid !== 0 && tilesets.some((tileset) => tileset.tileGids.includes(selectedGid))) return selectedGid;
    return tilesets.flatMap((tileset) => tileset.tileGids).find((gid) => gid !== 0) ?? 0;
}

function normalizeLayerName(name: string): string {
    return name.toLowerCase().replace(/[\s/_-]+/g, "");
}
