import { describe, expect, it } from "vitest";

import gameMapFrontWrapperSource from "../../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper.ts?raw";
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
            /if \(tileTexture !== undefined\) \{\s*gameMapFrontWrapper\.putTile\(null, x, y, layer\);\s*this\.renderOverlay/,
        );
    });

    it("keeps collision, exit, and start tiles native so their gameplay state is applied", () => {
        const renderTileSource = floorEditorToolSource.match(
            /private renderTile\([\s\S]*?\n {4}private getTileTexture/,
        )?.[0];

        expect(renderTileSource).toBeDefined();
        expect(renderTileSource).toContain("if (getAuthoringPathOverlayKind(layer) !== undefined)");
        expect(renderTileSource).toContain(
            "gameMapFrontWrapper.putTile(gid === 0 ? null : gid, x, y, layer, { render: false })",
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
        expect(gameMapFrontWrapperSource).toMatch(
            /this\.voidCollisionLayer\.setDepth\(-2\)\.setCollisionByProperty\(\{ collides: true \}\)\.setVisible\(false\)/,
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

    it("registers a newly embedded terrain tileset with the live tilemap before it is painted", () => {
        const loadRuntimeTilesetSource = floorEditorToolSource.match(
            /private async loadRuntimeTileset\([\s\S]*?\n {4}private setState/,
        )?.[0];

        expect(loadRuntimeTilesetSource).toBeDefined();
        expect(loadRuntimeTilesetSource).toContain("new Phaser.Tilemaps.Tileset(");
        expect(loadRuntimeTilesetSource).toContain("gameMapFrontWrapper.addTerrain(runtimeTileset)");
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

    it("uses signed world coordinates and synchronizes live geometry before rendering", () => {
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
        expect(renderRegionsSource).toContain("wrapper.synchronizeMapGeometry(map)");
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
});
