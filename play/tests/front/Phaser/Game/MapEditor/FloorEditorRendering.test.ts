import { describe, expect, it } from "vitest";

import gameMapFrontWrapperSource from "../../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper.ts?raw";
import elevationRendererSource from "../../../../../src/front/Phaser/Game/GameMap/ElevationRenderer.ts?raw";
import gameSceneSource from "../../../../../src/front/Phaser/Game/GameScene.ts?raw";
import floorEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts?raw";
import {
    findTilesetForGid,
    tileLayerCanRenderGid,
    type TileIndexSet,
} from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorRendering";

function tileset(firstGid: number, tileCount: number): TileIndexSet {
    return {
        containsTileIndex: (gid) => gid >= firstGid && gid < firstGid + tileCount,
    };
}

describe("floor editor rendering", () => {
    const stone = tileset(1, 100);
    const grass = tileset(101, 100);

    it("uses the selected terrain family for outside placement and paints through an existing edge", () => {
        const pointerDownSource = floorEditorToolSource.match(
            /private handlePointerDown\([\s\S]*?\n {4}private handlePointerUp/,
        )?.[0];
        const paintTileSource = floorEditorToolSource.match(
            /private paintTile\([\s\S]*?\n {4}private finishShapeDrag/,
        )?.[0];

        expect(pointerDownSource).toContain(
            "this.strokeAutotile = this.strokeWaterFillGid === undefined ? this.selectedAutotileForTileBrush : undefined",
        );
        expect(pointerDownSource).toContain("this.liquidStrokeAutotile = this.strokeAutotile");
        expect(pointerDownSource).not.toContain("this.selectedGid === this.strokeAutotile.center");
        expect(pointerDownSource).not.toContain("strokeStartGid === this.strokeAutotile.center");
        expect(pointerDownSource).toContain("this.paintTile(tile)");
        expect(paintTileSource).toContain("createLiquidTerrainBrushRegions");
        expect(paintTileSource).toContain("if (rawRegions.length === 0)");
        expect(paintTileSource).toContain("collectTerrainTiles");
        expect(paintTileSource).not.toContain("forEachTileInLayer");
        expect(paintTileSource).not.toContain("liquidStrokeHasExpanded");
        expect(paintTileSource).not.toContain("Object.values(this.liquidStrokeAutotile).includes");
        expect(paintTileSource).toContain("getMatchingTerrainFamilyGids(visibleMap, this.selectedGid)");
        expect(paintTileSource).toContain("this.strokeAutotile === undefined");
        expect(paintTileSource).toContain("createMergedTerrainAutotileRegions");
        expect(floorEditorToolSource).toContain("private getTileBrushAutotile");
        expect(floorEditorToolSource).toContain("function getMatchingTerrainFamilyGids");
        expect(floorEditorToolSource).toContain(
            "regions: collapseTileRegions(edits.flatMap((edit) => edit.forward.regions))",
        );
    });

    it("composes water as a borderless underlay beneath the selected surface", () => {
        expect(floorEditorToolSource).toContain("this.strokeWaterFillGid = this.selectedWaterFillGid");
        expect(floorEditorToolSource).toContain("createWaterTerrainBrushRegions");
        expect(floorEditorToolSource).toContain("createWaterTerrainRectangleRegions");
        expect(floorEditorToolSource).toContain("createWaterUnderlayLayer");
        expect(floorEditorToolSource).toContain("beforeLayer: tile.layer");
        expect(floorEditorToolSource).toContain("appendWaterCollisionRegions");
        expect(floorEditorToolSource).toContain("waterUnderlayCoverLayerName");
        expect(floorEditorToolSource).toContain("underlayCoverLayer === undefined ? 0.01 : -0.01");
    });

    it("stacks custom surfaces above the existing floor instead of replacing it", () => {
        expect(floorEditorToolSource).toContain("createSurfaceOverlayLayer");
        expect(floorEditorToolSource).toContain("surfaceOverlayLayerName");
        expect(floorEditorToolSource).toContain("getSurfaceOverlayLayerName");
        expect(floorEditorToolSource).toContain("layerJson: JSON.stringify(addedLayer)");
        expect(floorEditorToolSource).toContain("surfaceOverlayCoverLayerName(layer.name) === undefined");
        expect(floorEditorToolSource).not.toContain("cleanLoadedTilesetSpriteSheet");
        expect(gameSceneSource).not.toContain("cleanLoadedTilesetTexture");
    });

    it("stacks built-in non-water surfaces while keeping water on its underlay", () => {
        expect(floorEditorToolSource).toContain('this.selectedTilesetFirstGid = familyId === "water" ? 0 : firstGid');
        expect(floorEditorToolSource).toContain(
            "this.selectedTilesetFirstGid = this.selectedWaterFillGid === undefined ? firstGid : 0",
        );
        expect(floorEditorToolSource).not.toContain(
            "selectedTileset !== undefined && !BUILT_IN_TERRAIN_TILESET.matchesImage(selectedTileset.image)",
        );
        expect(floorEditorToolSource).toContain("this.surfaceStrokePlacementId = crypto.randomUUID()");
        expect(floorEditorToolSource).toContain(
            "this.selectedTilesetFirstGid,\n            this.surfaceStrokePlacementId",
        );
        expect(floorEditorToolSource).not.toContain(
            "this.selectedTilesetFirstGid,\n            targetLayerName",
        );
    });

    it("uses an overlay when a GPU layer cannot render the selected tileset", () => {
        expect(tileLayerCanRenderGid({ tileset: stone }, 118)).toBe(false);
        expect(findTilesetForGid([stone, grass], 118)).toBe(grass);
    });

    it("keeps native rendering when the layer already supports the selected tile", () => {
        expect(tileLayerCanRenderGid({ tileset: stone }, 18)).toBe(true);
        expect(tileLayerCanRenderGid({ tileset: [stone, grass] }, 118)).toBe(true);
    });

    it("uses the native tilemap renderer when the active layer already supports a runtime terrain tile", () => {
        const renderTileSource = floorEditorToolSource.match(
            /private renderTile\([\s\S]*?\n {4}private getTileTexture/,
        )?.[0];

        expect(renderTileSource).toBeDefined();
        expect(renderTileSource).not.toContain("if (runtimeTileset !== undefined)");
        expect(renderTileSource).toContain("if (!tileLayerCanRenderGid(phaserLayer, gid))");
    });

    it("clears the native tile before drawing a fallback overlay so stale collisions cannot survive", () => {
        const renderTileSource = floorEditorToolSource.match(
            /private renderTile\([\s\S]*?\n {4}private getTileTexture/,
        )?.[0];

        expect(renderTileSource).toBeDefined();
        expect(renderTileSource).toMatch(
            /if \(tileTexture !== undefined\) \{\s*gameMapFrontWrapper\.putTile\(null, x, y, layer, options\);\s*this\.renderOverlay/,
        );
    });

    it("keeps collision markers native while exit and start markers remain overlay-only", () => {
        const renderTileSource = floorEditorToolSource.match(
            /private renderTile\([\s\S]*?\n {4}private getTileTexture/,
        )?.[0];

        expect(renderTileSource).toBeDefined();
        expect(renderTileSource).toContain("const pathOverlayKind = getAuthoringPathOverlayKind(layer)");
        expect(renderTileSource).toMatch(
            /gameMapFrontWrapper\.putTile\(gid === 0 \? null : gid, x, y, layer, \{\s*render: pathOverlayKind === "collision",\s*deferRefresh: options\.deferRefresh,\s*\}\)/,
        );
        expect(renderTileSource!.indexOf("getAuthoringPathOverlayKind(layer)")).toBeLessThan(
            renderTileSource!.indexOf("!tileLayerCanRenderGid(phaserLayer, gid)"),
        );

        const putTileSource = gameMapFrontWrapperSource.match(
            /public putTile\([\s\S]*?\n {4}public canEntityBePlacedOnMap/,
        )?.[0];
        expect(putTileSource).toBeDefined();
        expect(putTileSource).toMatch(/if \(\s*render &&\s*this\.isGpuTilemapLayer\(phaserLayer\)/);
        expect(putTileSource).toContain("this.gameMap.putTileInFlatLayer(tileIndex");
        expect(putTileSource).toContain("phaserLayer.putTileAt(render ? tileIndex : -1");
        expect(putTileSource).toContain("tileProperties = this.gameMap.getTileProperty(tileIndex)");
        expect(putTileSource).toContain("replacePhaserTileProperties(phaserTile, tileProperties)");
    });

    it("keeps collision storage markers invisible and derives blocking from canonical cell state", () => {
        const playerCollisionSource = gameSceneSource.match(
            /private createCollisionWithPlayer\(\)[\s\S]*?\n {4}private /,
        )?.[0];
        const putTileSource = gameMapFrontWrapperSource.match(
            /public putTile\([\s\S]*?\n {4}public canEntityBePlacedOnMap/,
        )?.[0];

        expect(gameMapFrontWrapperSource).toContain(
            ".setVisible(isCollisionStorageLayer(layer.name) ? false : layer.visible)",
        );
        expect(gameMapFrontWrapperSource).toContain(
            "const renderedVisible = visible && !isCollisionStorageLayer(phaserLayer.layer.name)",
        );
        expect(gameMapFrontWrapperSource).toContain(
            "if (isCollisionStorageLayer(layer.layer.name) && !isAuthoringCollision) continue",
        );
        expect(gameMapFrontWrapperSource).toContain("getAuthoringCollisionGrid(map)");
        expect(playerCollisionSource).toContain("this.gameMapFrontWrapper.configurePhysicalCollision(phaserLayer)");
        expect(gameMapFrontWrapperSource).toContain('case "occupied"');
        expect(gameMapFrontWrapperSource).toContain("setCollisionByExclusion([-1], true)");
        expect(gameMapFrontWrapperSource).toContain('case "disabled"');
        expect(gameMapFrontWrapperSource).toContain("setCollisionByExclusion([], false)");
        expect(putTileSource).toContain("getPhysicalTileCollisionMode(");
        expect(putTileSource).toContain('physicalCollisionMode === "occupied"');
        expect(putTileSource).toContain('physicalCollisionMode === "disabled"');
    });

    it("materializes unsupported map cells as hidden dynamic collision state", () => {
        const playerCollisionSource = gameSceneSource.match(
            /private createCollisionWithPlayer\(\)[\s\S]*?\n {4}private /,
        )?.[0];

        expect(gameMapFrontWrapperSource).toContain('createBlankLayer("__voidCollisionLayer", terrains)');
        expect(gameMapFrontWrapperSource).toContain(
            'return getTileSupportGrid({ ...map, layers: applyRuntimeVisibility(map.layers, "") })',
        );
        expect(gameMapFrontWrapperSource).toContain("layer === this.voidCollisionLayer");
        expect(gameMapFrontWrapperSource).toContain(
            "this.voidCollisionLayer.setCollisionByProperty({ collides: true }).setVisible(false)",
        );
        expect(gameMapFrontWrapperSource).toContain(
            'this.gameRenderLayers.addMapLayer(this.voidCollisionLayer, "background", localDepth.background++)',
        );
        expect(playerCollisionSource).toContain("for (const phaserLayer of this.gameMapFrontWrapper.phaserLayers)");
        expect(playerCollisionSource).not.toContain('__voidCollisionLayer") {\n                continue');
    });

    it("refreshes void collision after terrain, visibility, and geometry changes", () => {
        const putTileSource = gameMapFrontWrapperSource.match(
            /public putTile\([\s\S]*?\n {4}public canEntityBePlacedOnMap/,
        )?.[0];
        const visibilitySource = gameMapFrontWrapperSource.match(
            /public setLayerVisibility\([\s\S]*?\n {4}\/\*\*/,
        )?.[0];
        const geometrySource = gameMapFrontWrapperSource.match(
            /public synchronizeMapGeometry\([\s\S]*?\n {4}public putTile/,
        )?.[0];

        expect(putTileSource).toContain("this.refreshVoidCollisionCell(x, y)");
        expect(visibilitySource).toContain("this.rebuildVoidCollisionLayer()");
        expect(geometrySource).toContain("this.rebuildVoidCollisionLayer()");
    });

    it("blocks editor and scripting deletions beneath local or visible remote avatars", () => {
        const putTileSource = gameMapFrontWrapperSource.match(
            /public putTile\([\s\S]*?\n {4}public canEntityBePlacedOnMap/,
        )?.[0];

        expect(putTileSource).toBeDefined();
        expect(putTileSource).toContain("tile === null");
        expect(putTileSource).toContain("isAvatarSupportingTileLayerName(layer)");
        expect(putTileSource).toContain("this.isTileOccupiedByAvatar(x, y)");
        expect(putTileSource).toContain("this.scene.CurrentPlayer.x");
        expect(putTileSource).toContain("this.scene.MapPlayersByKey.values()");
        expect(floorEditorToolSource).toContain("containsOccupiedVisualTileDeletion(mutation.regions)");
    });

    it("registers an embedded terrain tileset before activating or persisting its brush", () => {
        const loadRuntimeTilesetSource = floorEditorToolSource.match(
            /private async loadRuntimeTileset\([\s\S]*?\n {4}private setState/,
        )?.[0];
        const addTilesetSource = floorEditorToolSource.match(
            /private addTileset\([\s\S]*?\n {4}private activateEmbeddedSelection/,
        )?.[0];

        expect(loadRuntimeTilesetSource).toBeDefined();
        expect(loadRuntimeTilesetSource).toContain("new Phaser.Tilemaps.Tileset(");
        expect(loadRuntimeTilesetSource).toContain("gameMapFrontWrapper.addTerrain(runtimeTileset)");
        expect(addTilesetSource).toBeDefined();
        expect(addTilesetSource).toMatch(
            /this\.loadRuntimeTileset\(result\.firstGid[\s\S]*?\.then\(\(\) =>\s*this\.mapEditorModeManager\s*\.executeCommand/,
        );
    });

    it("carries terrain-family metadata through first-time embedded tile selection", () => {
        const handleActionSource = floorEditorToolSource.match(
            /private handleAction\([\s\S]*?\n {4}private preview/,
        )?.[0];
        const selectEmbeddedTileSource = floorEditorToolSource.match(
            /private selectEmbeddedTilesetTile\([\s\S]*?\n {4}private selectEmbeddedTilesetShape/,
        )?.[0];

        expect(handleActionSource).toContain("autotile: getBuiltInTerrainAutotile(action.tileId)");
        expect(selectEmbeddedTileSource).toContain("translateTerrainAutotileTiles(autotile, firstGid)");
    });

    it("does not paint with the previous brush while an embedded tile selection is loading", () => {
        const getTileAtPointerSource = floorEditorToolSource.match(
            /private getTileAtPointer\([\s\S]*?\n {4}private paintTile/,
        )?.[0];

        expect(getTileAtPointerSource).toBeDefined();
        expect(getTileAtPointerSource).toContain("this.pendingTilesetSelection !== undefined");
    });

    it("renders the selected collision, exit, or start path overlay", () => {
        const refreshOverlaySource = floorEditorToolSource.match(
            /private refreshPathOverlay\(\)[\s\S]*?\n {4}private clearPathOverlay/,
        )?.[0];

        expect(refreshOverlaySource).toBeDefined();
        expect(refreshOverlaySource).toContain("getAuthoringPathOverlay(map, this.selectedLayer)");
        expect(refreshOverlaySource).toContain("AUTHORING_PATH_OVERLAY_COLORS[overlay.kind]");
        expect(refreshOverlaySource).toContain("for (const cell of overlay.cells)");
    });

    it("uses the mode checker instead of a visual tile for state-only hover previews", () => {
        const hoverPreviewSource = floorEditorToolSource.match(
            /private showHoverPreview\([\s\S]*?\n {4}private clearHoverPreview/,
        )?.[0];

        expect(hoverPreviewSource).toBeDefined();
        expect(hoverPreviewSource).toContain("getAuthoringPathOverlay(visibleMap, tile.layer)");
        expect(hoverPreviewSource).toContain("if (pathOverlay === undefined)");
        expect(hoverPreviewSource).toContain("AUTHORING_PATH_OVERLAY_COLORS[pathOverlay.kind]");
        expect(hoverPreviewSource).toContain(".fillRect(left + halfWidth, top + halfHeight");
    });

    it("clears a hover preview without rewriting the tile underneath it", () => {
        const clearHoverPreviewSource = floorEditorToolSource.match(
            /private clearHoverPreview\(\)[\s\S]*?\n {4}private updateChangedTileKeys/,
        )?.[0];

        expect(clearHoverPreviewSource).toBeDefined();
        expect(clearHoverPreviewSource).not.toContain("this.renderTile(");
        expect(clearHoverPreviewSource).not.toContain("getTileLayerGid(");
        expect(clearHoverPreviewSource).toContain("this.scene.markDirty()");
    });

    it("keeps an already-selected state-only add brush active", () => {
        const selectBrushSource = floorEditorToolSource.match(
            /private selectBrush\([\s\S]*?\n {4}private clearBrush/,
        )?.[0];

        expect(selectBrushSource).toBeDefined();
        expect(selectBrushSource).toMatch(
            /if \(this\.selectedLayer === layer[\s\S]*?getAuthoringPathOverlay\(visibleMap, layer\) !== undefined[\s\S]*?return;[\s\S]*?this\.clearBrush\(\)/,
        );
    });

    it("returns to pointer mode when Escape cancels an active floor action", () => {
        const keyDownSource = floorEditorToolSource.match(
            /public handleKeyDownEvent\([\s\S]*?\n {4}public async handleIncomingCommandMessage/,
        )?.[0];

        expect(keyDownSource).toBeDefined();
        expect(keyDownSource).toMatch(
            /if \(event\.key !== "Escape"\) return;[\s\S]*?this\.cancelShapeDrag\(\);[\s\S]*?this\.finishPaintStroke\(\);[\s\S]*?this\.clearBrush\(\);/,
        );
    });

    it("disables entity hit testing while the floor editor is active", () => {
        const activateSource = floorEditorToolSource.match(/public activate\(\)[\s\S]*?\n {4}public destroy/)?.[0];

        expect(activateSource).toBeDefined();
        expect(activateSource).toContain(
            "this.scene.getGameMapFrontWrapper().getEntitiesManager().makeAllEntitiesNonInteractive()",
        );
    });

    it("uses signed world coordinates and batches live tile rendering", () => {
        const pointerSource = floorEditorToolSource.match(
            /private getTileAtPointer\([\s\S]*?\n {4}private paintTile/,
        )?.[0];
        const renderRegionsSource = floorEditorToolSource.match(
            /private renderRegions\([\s\S]*?\n {4}private refreshPathOverlay/,
        )?.[0];

        expect(pointerSource).toBeDefined();
        expect(pointerSource).not.toMatch(/x < 0|y < 0|x >= width|y >= height/);
        expect(pointerSource).toContain("worldToTileCoordinates(visibleMap, pointer.worldX, pointer.worldY)");
        expect(floorEditorToolSource).not.toContain("planTerrainExpansion");
        expect(renderRegionsSource).toContain("wrapper.synchronizeMapGeometryIfNeeded(map)");
        expect(renderRegionsSource).toContain("deferRefresh: true");
        expect(renderRegionsSource).toContain("wrapper.refreshTileBatch(renderedCells, map)");
        expect(gameMapFrontWrapperSource).toContain("public refreshTileBatch(");
        expect(gameMapFrontWrapperSource).toContain("this.hasVisibleTileSupportAt(source.layers");
    });

    it("renders elevation only over its sparse authored bounds", () => {
        const acknowledgeSource = floorEditorToolSource.match(
            /public acknowledgeTerrainMutation\(\)[\s\S]*?\n {4}public rejectTerrainMutation/,
        )?.[0];

        expect(elevationRendererSource).toContain("getElevationSurfaceBounds");
        expect(elevationRendererSource).not.toContain("getMapTileBounds");
        expect(elevationRendererSource).toContain("getElevationSurfaceMesh(map, ELEVATION_WORLD_LAYER, 4)");
        expect(elevationRendererSource).toContain("this.map = map");
        expect(acknowledgeSource).toBeDefined();
        expect(acknowledgeSource).not.toContain("getElevationRenderer().render");
    });

    it("erases the topmost visible tile instead of staying locked to the previously selected layer", () => {
        const pointerSource = floorEditorToolSource.match(
            /private getTileAtPointer\([\s\S]*?\n {4}private paintTile/,
        )?.[0];

        expect(pointerSource).toBeDefined();
        expect(pointerSource).toContain("findTopmostErasableLayer");
        expect(pointerSource).toContain("getAuthoringPathOverlayKind(this.selectedLayer) === undefined");
    });

    it("accepts another eraser click while the previous terrain mutation is saving", () => {
        const pointerDownSource = floorEditorToolSource.match(
            /private handlePointerDown\([\s\S]*?\n {4}private handlePointerUp/,
        )?.[0];

        expect(pointerDownSource).toBeDefined();
        expect(pointerDownSource).not.toContain("if (this.saving) return");
    });

    it("uses the rectangle lifecycle for a Shift-held single-tile brush", () => {
        const pointerDownSource = floorEditorToolSource.match(
            /private handlePointerDown\([\s\S]*?\n {4}private handlePointerUp/,
        )?.[0];
        const finishShapeDragSource = floorEditorToolSource.match(
            /private finishShapeDrag\([\s\S]*?\n {4}private cancelShapeDrag/,
        )?.[0];

        expect(pointerDownSource).toBeDefined();
        expect(pointerDownSource).toContain("this.shiftKey?.isDown");
        expect(pointerDownSource).not.toContain("this.selectedGid !== 0");
        expect(pointerDownSource).toContain('{ kind: "tile" as const, gid: this.selectedGid }');
        expect(pointerDownSource).toContain("this.shapeBrush = shapeBrush");
        expect(finishShapeDragSource).toBeDefined();
        expect(finishShapeDragSource).toContain('brush.kind === "autotile"');
        expect(finishShapeDragSource).toContain("createTerrainTileRegion(start.layer, start, end, brush.gid)");
    });

    it("keeps elevation sculpting active and maps Command and Shift to brush modifiers", () => {
        const updateSource = floorEditorToolSource.match(/public update\([\s\S]*?\n {4}public clear/)?.[0];
        const pointerSource = floorEditorToolSource.match(
            /private getTileAtPointer\([\s\S]*?\n {4}private paintTile/,
        )?.[0];
        const pointerDownSource = floorEditorToolSource.match(
            /private handlePointerDown\([\s\S]*?\n {4}private handlePointerUp/,
        )?.[0];
        const pointerMoveSource = floorEditorToolSource.match(
            /private handlePointerMove\([\s\S]*?\n {4}private handlePointerDown/,
        )?.[0];

        expect(updateSource).toContain("this.paintElevation(this.elevationPointerTile)");
        expect(updateSource).toContain("ELEVATION_REPEAT_INTERVAL_MS");
        expect(pointerDownSource).toContain("this.painting = true");
        expect(pointerDownSource).toContain("getElevationDirection(pointer)");
        expect(pointerDownSource).toContain("WIDE_ELEVATION_BRUSH_RADIUS");
        expect(pointerMoveSource).toContain("this.elevationPointerTile = tile");
        expect(pointerSource).toContain('toolMode === "elevation"');
        expect(pointerSource).toContain("findTopmostErasableLayer");
        expect(floorEditorToolSource).toContain("event?.metaKey === true");
        expect(floorEditorToolSource).toContain("event?.shiftKey === true");
        expect(floorEditorToolSource).toContain("ELEVATION_WORLD_LAYER");
        expect(floorEditorToolSource).toContain("sculptElevation(source, ELEVATION_WORLD_LAYER");
    });

    it("preserves elevation mode across preview, saving, and acknowledgement state refreshes", () => {
        const setStateSource = floorEditorToolSource.match(/private setState\([\s\S]*?\n {4}}\n}/)?.[0];

        expect(setStateSource).toBeDefined();
        expect(setStateSource).toContain('previous?.toolMode === "elevation"');
        expect(setStateSource).toContain('? "elevation"');
        expect(setStateSource).toMatch(/this\.selectedAutotile === undefined\s*\? "tile"\s*: "shape"/);
    });

    it("warps natural terrain with a persisted textured surface and lifts world assets", () => {
        expect(elevationRendererSource).toContain("ELEVATION_WORLD_LAYER");
        expect(elevationRendererSource).toContain("getElevationSurfaceMesh(map, ELEVATION_WORLD_LAYER, 4)");
        expect(elevationRendererSource).toContain("const compositeSources = this.getCompositeSources()");
        expect(elevationRendererSource).toContain("capture.draw(compositeSources");
        expect(elevationRendererSource).toContain(".mesh2d(0, 0, capture.texture, vertices, indices)");
        expect(elevationRendererSource).toContain("addToSameMapBand(referenceSource, mesh");
        expect(elevationRendererSource).not.toContain("fillStyle(0x72d598");
        expect(elevationRendererSource).not.toContain("setAlpha(0.72)");
        expect(elevationRendererSource).toContain("this.scene.CurrentPlayer?.setElevationOffset");
        expect(elevationRendererSource).toContain("this.scene.MapPlayersByKey.values()");
        expect(elevationRendererSource).toContain("getEntitiesManager().getEntities().values()");
        expect(gameSceneSource).toContain("this.elevationRenderer?.updateWorldObjects()");
        expect(floorEditorToolSource).toContain("this.scene.getElevationRenderer().render(updated)");
        expect(floorEditorToolSource).not.toContain("clearElevationOverlay");
        expect(floorEditorToolSource).not.toContain("layerHasElevatableTerrain");
        expect(floorEditorToolSource).toContain(
            "isElevatableTerrainGid(source, getTileLayerGid(layer, tile.x, tile.y))",
        );
    });

    it("composites water underlays into the floor before applying elevation", () => {
        expect(elevationRendererSource).toContain("ELEVATION_COMPOSITE_LAYER_DATA_KEY");
        expect(elevationRendererSource).toContain(".phaserLayers.filter");
        expect(elevationRendererSource).toContain("capture.draw(compositeSources");
        expect(floorEditorToolSource).toContain("overlay.setData(ELEVATION_COMPOSITE_LAYER_DATA_KEY");
        expect(floorEditorToolSource).toContain("const surfaceCoverLayer = surfaceOverlayCoverLayerName(layer)");
        expect(floorEditorToolSource).toContain("const compositeCoverLayer = underlayCoverLayer ?? surfaceCoverLayer");
        expect(floorEditorToolSource).toContain("compositeCoverLayer ?? layer");
    });
});
