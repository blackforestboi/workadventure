import { describe, expect, it } from "vitest";
import {
    getCollisionGridOffset,
    getScaledCollisionGridFrame,
    reverseEntityCollisionGrid,
    scaleEntityCollisionGrid,
} from "../../../../../src/front/Phaser/Game/MapEditor/Entities/EntityCollisionGrid";
import entityResizeHandlesSource from "../../../../../src/front/Phaser/Game/MapEditor/Entities/EntityResizeHandles.ts?raw";
import gameMapFrontWrapperSource from "../../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper.ts?raw";
import entityEditorToolSource from "../../../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts?raw";
import entitiesManagerSource from "../../../../../src/front/Phaser/Game/GameMap/EntitiesManager.ts?raw";

describe("EntityCollisionGrid", () => {
    it("anchors the collision frame at the same point as the editor overlay", () => {
        expect(getCollisionGridOffset([[1, 0]], 80, 56, 4, -2)).toEqual({ x: 12, y: 10 });
    });

    it("scales the collision frame with a resized asset while preserving its relative offset", () => {
        expect(getScaledCollisionGridFrame([[1, 0]], 128, 96, 64, 48, 8, -4)).toEqual({
            collisionGrid: [[1]],
            offset: { x: 20, y: 14 },
        });
    });

    it("keeps a collision mask unchanged at its source tile size", () => {
        expect(
            scaleEntityCollisionGrid(
                [
                    [0, 0],
                    [1, 1],
                ],
                64,
                64,
            ),
        ).toEqual([
            [0, 0],
            [1, 1],
        ]);
    });

    it("expands painted areas when an entity is resized larger", () => {
        expect(
            scaleEntityCollisionGrid(
                [
                    [0, 0],
                    [1, 0],
                ],
                128,
                128,
            ),
        ).toEqual([
            [0, 0, 0, 0],
            [0, 0, 0, 0],
            [1, 1, 0, 0],
            [1, 1, 0, 0],
        ]);
    });

    it("keeps any painted source area covered by a smaller target cell", () => {
        expect(
            scaleEntityCollisionGrid(
                [
                    [0, 0, 0, 0],
                    [0, 1, 0, 0],
                    [0, 0, 0, 0],
                    [0, 0, 0, 1],
                ],
                64,
                64,
            ),
        ).toEqual([
            [1, 0],
            [0, 1],
        ]);
    });

    it("reverses occupied cells when removing an entity from the collision layer", () => {
        expect(
            reverseEntityCollisionGrid([
                [0, 1],
                [1, 0],
            ]),
        ).toEqual([
            [0, -1],
            [-1, 0],
        ]);
    });

    it("draws the selected-object outline as the collision grid tiles", () => {
        expect(entityResizeHandlesSource).toContain("getCollisionGridPosition()");
        expect(entityResizeHandlesSource).toContain("this.outline.lineBetween");
        expect(entityResizeHandlesSource).toContain("width: Math.max(...collisionGrid.map((row) => row.length)) * 32");
        expect(entityResizeHandlesSource).toContain("height: collisionGrid.length * 32");
    });

    it("only blocks placement for painted collision cells", () => {
        expect(gameMapFrontWrapperSource).toContain("hasBlockedCollisionCell");
        expect(gameMapFrontWrapperSource).toContain("hasBlockedCollisionCell ? collisionGrid : undefined");
        expect(gameMapFrontWrapperSource).toMatch(/collisionGrid\s*\? 0\s*:\s*width/);
    });

    it("keeps placing and dragging assets free from tile snapping", () => {
        expect(entityEditorToolSource).toContain("return { x: pointer.worldX, y: pointer.worldY };");
        expect(entityEditorToolSource).not.toContain("Math.floor(pointer.worldX / 32)");
        expect(entitiesManagerSource).toContain("entity.x = dragX;");
        expect(entitiesManagerSource).toContain("entity.y = dragY;");
    });
});
