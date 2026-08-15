import { describe, expect, it } from "vitest";
import {
    getEntityCollisionRectangles,
    getScaledCollisionGridFrame,
    getWallCollisionGridFrame,
} from "../../../../../src/front/Phaser/Game/MapEditor/Entities/EntityCollisionGrid";
import entityResizeHandlesSource from "../../../../../src/front/Phaser/Game/MapEditor/Entities/EntityResizeHandles.ts?raw";
import entitySource from "../../../../../src/front/Phaser/ECS/Entity.ts?raw";
import gameMapFrontWrapperSource from "../../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper.ts?raw";
import gameSceneSource from "../../../../../src/front/Phaser/Game/GameScene.ts?raw";
import entityEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts?raw";
import entitiesManagerSource from "../../../../../src/front/Phaser/Game/GameMap/EntitiesManager.ts?raw";
import wallTextureProjectorSource from "../../../../../src/front/Phaser/Game/MapEditor/Entities/WallTextureProjector.ts?raw";
import updateEntityFrontCommandSource from "../../../../../src/front/Phaser/Game/MapEditor/Commands/Entity/UpdateEntityFrontCommand.ts?raw";

describe("EntityCollisionGrid", () => {
    it("replaces legacy stored wall dimensions with the exact orientation geometry", () => {
        expect(entitySource).toContain("const wallSize = getWallRenderSize(");
        expect(entitySource).toContain("const migratedPosition = migrateLegacyWallPosition(");
        expect(entitySource).toContain("this.setPosition(migratedPosition.x, migratedPosition.y);");
        expect(entitySource).toContain("this.entityData.width = wallSize.width;");
        expect(entitySource).toContain("this.entityData.height = wallSize.height;");
        expect(wallTextureProjectorSource).toContain("entity.setDisplaySize(wallSize.width, wallSize.height);");
    });

    it("uses the same tile-edge anchor for wall preview and saved placement", () => {
        expect(entityEditorToolSource).toContain("const topLeft = getWallTopLeftPosition(");
        expect(entityEditorToolSource).toContain("snapWorldPointToWallPlacement(");
        expect(entityEditorToolSource).not.toContain("snapWorldPointToWallTile(");
        expect(entityEditorToolSource).toContain("x: topLeft.x,");
        expect(entityEditorToolSource).toContain("y: topLeft.y,");
        expect(entityEditorToolSource).toContain("this.setWallPreviewPosition(tile, orientation);");
    });

    it("serializes exact integer wall dimensions instead of Phaser display floats", () => {
        const start = entityEditorToolSource.indexOf("private placeWallTile");
        const end = entityEditorToolSource.indexOf("private updateWallPreviewForActivePointer", start);
        const placeWallTileSource = entityEditorToolSource.slice(start, end);

        expect(placeWallTileSource).toContain("const wallSize = getWallRenderSize(");
        expect(placeWallTileSource).toContain("width: wallSize.width,");
        expect(placeWallTileSource).toContain("height: wallSize.height,");
        expect(placeWallTileSource).not.toContain("width: this.entityPrefabPreview.displayWidth");
        expect(placeWallTileSource).not.toContain("height: this.entityPrefabPreview.displayHeight");
    });

    it("cycles and locks wall placement to the selected Shift rotation state", () => {
        const start = entityEditorToolSource.indexOf("private startWallDrag");
        const end = entityEditorToolSource.indexOf("private extendWallDrag", start);
        const startWallDragSource = entityEditorToolSource.slice(start, end);

        expect(entityEditorToolSource).toContain(
            "this.wallPlacementOrientation = getNextWallPlacementOrientation(this.wallPlacementOrientation)",
        );
        expect(startWallDragSource).toContain("this.wallDragOrientation = this.wallPlacementOrientation;");
        expect(entityEditorToolSource).not.toContain('this.shiftKey?.isDown ? "diagonal-down" : "horizontal"');
    });

    it("places a vertical wall on a one-pixel blocking tile edge", () => {
        const frame = getWallCollisionGridFrame(
            [
                [0, 0],
                [1, 1],
            ],
            64,
            0,
            2,
        );

        expect(frame).toEqual({ collisionGrid: [[0], [1]], offset: { x: 0, y: 0 }, width: 1, height: 64 });
        expect(getEntityCollisionRectangles(frame, { x: 32, y: 0 })).toEqual([{ x: 32, y: 32, width: 1, height: 32 }]);
        expect(wallTextureProjectorSource).toContain('context.fillStyle = "#000000"');
        expect(wallTextureProjectorSource).toContain("WALL_EDGE_RENDER_WIDTH");
    });

    it("keeps a diagonal wall collision on its one-by-two base footprint", () => {
        const frame = getWallCollisionGridFrame(
            [
                [0, 0],
                [1, 1],
            ],
            80,
            1,
            2,
        );

        expect(frame).toEqual({
            collisionGrid: [[0], [1]],
            offset: { x: 0, y: 16 },
            width: 32,
            height: 64,
        });
        expect(getEntityCollisionRectangles(frame, { x: 64, y: 32 })).toEqual([
            { x: 64, y: 80, width: 32, height: 32 },
        ]);
    });

    it("scales the collision frame with a resized asset while preserving its relative offset", () => {
        expect(getScaledCollisionGridFrame([[1, 0]], 128, 96, 64, 48, 8, -4)).toEqual({
            collisionGrid: [[1, 0]],
            offset: { x: 12, y: 18 },
            width: 32,
            height: 16,
        });
    });

    it("creates exact asset-local collision rectangles without map-tile rasterization", () => {
        const frame = getScaledCollisionGridFrame([[1, 0]], 128, 96, 64, 48, 8, -4);
        expect(getEntityCollisionRectangles(frame, { x: 10, y: 20 })).toEqual([
            { x: 22, y: 38, width: 16, height: 16 },
        ]);
    });

    it("draws the asset's grid inside the rendered-object resize outline", () => {
        expect(entityResizeHandlesSource).toContain("getCollisionFrameBounds()");
        expect(entityResizeHandlesSource).toContain("this.outline.lineBetween");
        expect(entityResizeHandlesSource).toContain("const bounds = this.getBounds();");
        expect(entityResizeHandlesSource).toContain("const tileWidth = bounds.width / columns;");
        expect(entityResizeHandlesSource).toContain("const tileHeight = bounds.height / collisionGrid.length;");
    });

    it("scales display-sized prefab collision grids with the rendered sprite", () => {
        expect(entitySource).toContain("this.prefab.defaultDimensionsControlDisplay");
        expect(entitySource).toContain("? this.width");
        expect(entitySource).toContain("? this.height");
        expect(entityEditorToolSource).toContain("? this.entityPrefabPreview.width");
        expect(entityEditorToolSource).toContain("? this.entityPrefabPreview.height");
    });

    it("keeps entity collision geometry out of the map tile collision layer", () => {
        expect(gameMapFrontWrapperSource).not.toContain("__entitiesCollisionLayer");
        expect(gameMapFrontWrapperSource).not.toContain("modifyToCollisionsLayer");
        expect(entitiesManagerSource).toContain("collisionGroup");
        expect(entitiesManagerSource).toContain("getCollisionRectangles()");
        expect(gameSceneSource).toContain("getEntitiesManager().getCollisionGroup()");
        expect(updateEntityFrontCommandSource).toContain("refreshEntityCollisionBodies(entity)");
        expect(updateEntityFrontCommandSource).not.toContain("CollisionGrid");
    });

    it("keeps placing and dragging assets free from tile snapping", () => {
        expect(entityEditorToolSource).toContain("return { x: pointer.worldX, y: pointer.worldY };");
        expect(entityEditorToolSource).not.toContain("Math.floor(pointer.worldX / 32)");
        expect(entitiesManagerSource).toContain("entity.x = dragX;");
        expect(entitiesManagerSource).toContain("entity.y = dragY;");
    });
});
