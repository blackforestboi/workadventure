import { describe, expect, it } from "vitest";

import floorEditorSource from "../../../../../src/front/Components/MapEditor/FloorEditor/FloorEditor.svelte?raw";
import entityEditorPickerSource from "../../../../../src/front/Components/MapEditor/EntityEditor/EntityEditorPicker.svelte?raw";
import entityUploadSource from "../../../../../src/front/Components/MapEditor/EntityEditor/EntityUpload/EntityUpload.svelte?raw";
import customEntityEditionFormSource from "../../../../../src/front/Components/MapEditor/EntityEditor/CustomEntityEditionForm/CustomEntityEditionForm.svelte?raw";
import {
    getActiveTerrainModeId,
    getActiveAuthoringPathTool,
    getTerrainModeOptions,
    isAuthoringPathMode,
    isTerrainAssetBrowserMode,
    resolveTerrainModeBrushGid,
} from "../../../../../src/front/Components/MapEditor/FloorEditor/FloorEditorModes";

function layer(name: string) {
    return { name, width: 40, height: 30 };
}

describe("getTerrainModeOptions", () => {
    it("exposes the elevation mode beside floor painting", () => {
        const options = getTerrainModeOptions([
            layer("collision 1"),
            layer("collision 2"),
            layer("floor"),
            layer("exit"),
            layer("start 1"),
            layer("start 2"),
            layer("walls"),
        ]);

        expect(options).toEqual([
            { id: "pointer", label: "Pointer", layer: "" },
            { id: "floor", label: "Floor", layer: "floor" },
            { id: "elevation", label: "Elevation", layer: "floor" },
            { id: "eraser", label: "Eraser", layer: "" },
            { id: "collision", label: "Collision 1", layer: "collision 1" },
            { id: "exit", label: "Exit", layer: "exit" },
            { id: "start", label: "Start 1", layer: "start 1" },
            { id: "walls", label: "Walls", layer: "walls" },
        ]);
    });

    it("supports legacy unnumbered layer names without exposing secondary layers", () => {
        const options = getTerrainModeOptions([
            layer("collisions2"),
            layer("collisions"),
            layer("floor"),
            layer("start2"),
            layer("start"),
        ]);

        expect(options.map((option) => option.layer)).toEqual([
            "",
            "floor",
            "floor",
            "",
            "collisions",
            undefined,
            "start",
            undefined,
        ]);
    });

    it("keeps a compatible brush and falls back to the first paint tile", () => {
        const tilesets = [{ tileGids: [10, 11, 12] }];

        expect(resolveTerrainModeBrushGid(11, tilesets)).toBe(11);
        expect(resolveTerrainModeBrushGid(443, tilesets)).toBe(10);
        expect(resolveTerrainModeBrushGid(0, tilesets)).toBe(10);
        expect(resolveTerrainModeBrushGid(0, [])).toBe(0);
    });

    it("identifies the state-only terrain modes", () => {
        expect(isAuthoringPathMode("collision")).toBe(true);
        expect(isAuthoringPathMode("exit")).toBe(true);
        expect(isAuthoringPathMode("start")).toBe(true);
        expect(isAuthoringPathMode("floor")).toBe(false);
        expect(isAuthoringPathMode("walls")).toBe(false);
        expect(isAuthoringPathMode("pointer")).toBe(false);
        expect(isAuthoringPathMode("eraser")).toBe(false);
    });

    it("shares the terrain asset browser between pointer and floor modes", () => {
        expect(isTerrainAssetBrowserMode("pointer")).toBe(true);
        expect(isTerrainAssetBrowserMode("floor")).toBe(true);
        expect(isTerrainAssetBrowserMode("eraser")).toBe(false);
        expect(isTerrainAssetBrowserMode("walls")).toBe(false);
        expect(isTerrainAssetBrowserMode("collision")).toBe(false);
    });

    it("keeps the search and add-asset controls available in both browser modes", () => {
        expect(floorEditorSource.match(/isTerrainAssetBrowserMode\(activeTerrainModeId\)/g)).toHaveLength(2);
        expect(floorEditorSource).toContain("if (!isTerrainAssetBrowserMode(mode.id))");
        expect(floorEditorSource).not.toContain('activeTerrainModeId === "floor"');
    });

    it("opens entity wall assets from the terrain Walls shortcut", () => {
        expect(floorEditorSource).toContain('if (mode.id === "walls")');
        expect(floorEditorSource).toContain("openWallAssetBrowser()");
        expect(floorEditorSource).toContain('tag: "walls"');
        expect(floorEditorSource).toContain("equipTool(EditorToolName.EntityEditor)");
    });

    it("keeps an empty Walls category actionable and presets new assets as walls", () => {
        expect(entityEditorPickerSource).not.toContain("if (wallEntitiesPrefabsVariants.length > 0)");
        expect(entityEditorPickerSource).toContain("No wall assets yet");
        expect(entityEditorPickerSource).toContain("Create wall asset");
        expect(entityEditorPickerSource).toContain("initialWall={createWallAsset}");
        expect(entityUploadSource).toContain("initialWall = false");
        expect(entityUploadSource).toContain("normalizeWallAssetRaster(source)");
        expect(entityUploadSource).toContain("const isWallAsset = customEditedEntity.wall !== undefined");
        expect(entityUploadSource).toContain("animation: isWallAsset ? undefined : customEditedEntity.animation");
        expect(entityUploadSource).toContain("defaultSizeInTiles: initialWall ? WALL_DEFAULT_WIDTH_TILES : undefined");
        expect(entityUploadSource).toContain(
            "defaultHeightInTiles: initialWall ? WALL_DEFAULT_HEIGHT_TILES : undefined",
        );
        expect(entityUploadSource).toContain(
            "createWallFoundationCollisionGrid(WALL_DEFAULT_WIDTH_TILES, WALL_DEFAULT_HEIGHT_TILES)",
        );
        expect(entityUploadSource).toContain("projectionDepthTiles: WALL_DEFAULT_PROJECTION_DEPTH_TILES");
        expect(customEntityEditionFormSource).toContain("defaultSizeInTiles = WALL_DEFAULT_WIDTH_TILES");
        expect(customEntityEditionFormSource).toContain("defaultHeightInTiles = WALL_DEFAULT_HEIGHT_TILES");
        expect(customEntityEditionFormSource).toContain(
            "createWallFoundationCollisionGrid(WALL_DEFAULT_WIDTH_TILES, WALL_DEFAULT_HEIGHT_TILES)",
        );
        expect(customEntityEditionFormSource).toContain(
            "initialWall?.projectionDepthTiles ?? WALL_DEFAULT_PROJECTION_DEPTH_TILES",
        );
    });

    it("presents water as one borderless underlay instead of shoreline variants", () => {
        expect(floorEditorSource).toMatch(
            /group\.autotile === undefined \|\|\s+terrainFamily\.group\.id === "water"/,
        );
        expect(floorEditorSource).toContain('? " · underlay"');
    });

    it("keeps legacy tilesheets searchable and keyboard-accessible without offering terrain shapes", () => {
        expect(floorEditorSource).toContain("BUILT_IN_LEGACY_MAP_TILESETS");
        expect(floorEditorSource).toContain("Legacy map assets");
        expect(floorEditorSource).toContain("matchesLegacyTileset");
        expect(floorEditorSource).toContain("aria-pressed={gid !== undefined && state.selectedGid === gid}");
        expect(floorEditorSource).toContain("${tileset.name} from ${tileset.source}");
        expect(floorEditorSource).not.toContain("selectLibraryShape(state.selectedLayer, tileset");
    });

    it("keeps path modes active while treating a zero floor brush as the eraser", () => {
        const modes = getTerrainModeOptions([
            layer("collisions"),
            layer("floor"),
            layer("exit"),
            layer("start 1"),
            layer("walls"),
        ]);

        expect(getActiveTerrainModeId(modes, "", 0)).toBe("pointer");
        expect(getActiveTerrainModeId(modes, "floor", 11)).toBe("floor");
        expect(getActiveTerrainModeId(modes, "floor", 0)).toBe("eraser");
        expect(getActiveTerrainModeId(modes, "floor", 1, "elevation")).toBe("elevation");
        expect(getActiveTerrainModeId(modes, "collisions", 0)).toBe("collision");
        expect(getActiveTerrainModeId(modes, "walls", 12)).toBe("walls");
    });

    it("provides dedicated add and remove tools for every state-only mode", () => {
        const modes = getTerrainModeOptions([
            layer("collisions"),
            layer("floor"),
            layer("exit"),
            layer("start 1"),
            layer("walls"),
        ]);

        expect(getActiveAuthoringPathTool(modes, "collisions")).toMatchObject({
            id: "collision",
            addLabel: "Add collision",
            removeLabel: "Remove collision",
        });
        expect(getActiveAuthoringPathTool(modes, "exit")).toMatchObject({
            id: "exit",
            addLabel: "Add exit",
            removeLabel: "Remove exit",
        });
        expect(getActiveAuthoringPathTool(modes, "start 1")).toMatchObject({
            id: "start",
            addLabel: "Add start",
            removeLabel: "Remove start",
        });
        expect(getActiveAuthoringPathTool(modes, "floor")).toBeUndefined();
        expect(getActiveAuthoringPathTool(modes, "walls")).toBeUndefined();
        expect(getActiveAuthoringPathTool(modes, "")).toBeUndefined();
    });
});
