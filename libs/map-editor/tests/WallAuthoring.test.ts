import { describe, expect, it } from "vitest";
import {
    createWallFoundationCollisionGrid,
    getNextWallPlacementOrientation,
    getWallRenderSize,
    getWallTopLeftPosition,
    getWallPlacementSize,
    getWallDragOrientation,
    getWallDragTiles,
    getWallProjectionRise,
    migrateLegacyWallPosition,
    snapWorldPointToWallTile,
    snapWorldPointToWallPlacement,
    WallProfile,
} from "../src";

describe("wall authoring", () => {
    it("cycles Shift through horizontal, right diagonal, down, and left diagonal", () => {
        let orientation: ReturnType<typeof getNextWallPlacementOrientation> = "horizontal";
        const states: ReturnType<typeof getNextWallPlacementOrientation>[] = [];
        for (let index = 0; index < 4; index += 1) {
            orientation = getNextWallPlacementOrientation(orientation);
            states.push(orientation);
        }
        expect(states).toEqual(["diagonal-down", "vertical", "diagonal-up", "horizontal"]);
    });

    it("defaults the diagonal offset to one tile for a three-tile-high rendered shape", () => {
        expect(WallProfile.parse({ version: 1 }).projectionDepthTiles).toBe(1);
        expect(getWallProjectionRise(32, WallProfile.parse({ version: 1 }).projectionDepthTiles)).toBe(32);
    });

    it("keeps legacy wall profiles at an exact one-tile 45 degree rise", () => {
        expect(getWallProjectionRise(32, 0.5)).toBe(32);
    });

    it("uses a 2x2 horizontal, 0x2 vertical, and 1x2 diagonal footprint", () => {
        expect(getWallPlacementSize("horizontal")).toEqual({ widthInTiles: 2, heightInTiles: 2 });
        expect(getWallPlacementSize("vertical")).toEqual({ widthInTiles: 0, heightInTiles: 2 });
        expect(getWallPlacementSize("diagonal-up")).toEqual({ widthInTiles: 1, heightInTiles: 2 });
        expect(getWallPlacementSize("diagonal-down")).toEqual({ widthInTiles: 1, heightInTiles: 2 });
    });

    it("normalizes stored wall dimensions to the orientation geometry", () => {
        expect(getWallRenderSize("horizontal")).toEqual({ width: 64, height: 64 });
        expect(getWallRenderSize("horizontal", 1.9999999999999998, 1.9999999999999998)).toEqual({
            width: 64,
            height: 64,
        });
        expect(getWallRenderSize("diagonal-down")).toEqual({ width: 32, height: 96 });
        expect(getWallRenderSize("diagonal-up")).toEqual({ width: 32, height: 96 });
        expect(getWallRenderSize("vertical")).toEqual({ width: 1, height: 64 });
    });

    it("joins a right diagonal to a horizontal wall on the same tile edge", () => {
        expect(getWallTopLeftPosition({ x: 3, y: 4 }, "horizontal")).toEqual({ x: 96, y: 128 });
        expect(getWallTopLeftPosition({ x: 3, y: 4 }, "diagonal-down")).toEqual({ x: 96, y: 128 });
        expect(getWallTopLeftPosition({ x: 3, y: 4 }, "diagonal-up")).toEqual({ x: 96, y: 96 });
    });

    it("snaps horizontal walls to the nearest edge instead of the containing tile", () => {
        expect(snapWorldPointToWallPlacement(70, 65, "horizontal")).toEqual({ x: 2, y: 2 });
        const upperEdge = snapWorldPointToWallPlacement(70, 79, "horizontal");
        expect(upperEdge).toEqual({ x: 2, y: 2 });
        expect(getWallTopLeftPosition(upperEdge, "horizontal")).toEqual({ x: 64, y: 64 });
        expect(snapWorldPointToWallPlacement(70, 81, "horizontal")).toEqual({ x: 2, y: 3 });
        expect(snapWorldPointToWallPlacement(70, 79, "diagonal-down")).toEqual({ x: 2, y: 2 });
    });

    it("keeps the horizontal edge fixed while migrating a legacy right diagonal onto it", () => {
        expect(migrateLegacyWallPosition({ x: 64, y: 64 }, 64, "horizontal")).toEqual({ x: 64, y: 64 });
        expect(migrateLegacyWallPosition({ x: 128, y: 48 }, 80, "diagonal-down")).toEqual({ x: 128, y: 64 });
    });

    it("collides only on the foundation row by default", () => {
        expect(createWallFoundationCollisionGrid(2, 3)).toEqual([
            [0, 0],
            [0, 0],
            [1, 1],
        ]);
    });

    it("snaps world points to map tiles", () => {
        expect(snapWorldPointToWallTile(63, 65)).toEqual({ x: 1, y: 2 });
    });

    it("locks a mostly horizontal drag to one gap-free row of two-tile wall pieces", () => {
        const start = { x: 2, y: 4 };
        const current = { x: 6, y: 5 };
        const orientation = getWallDragOrientation(start, current, false);
        expect(orientation).toBe("horizontal");
        expect(getWallDragTiles(start, current, orientation)).toEqual([
            { x: 2, y: 4 },
            { x: 4, y: 4 },
            { x: 6, y: 4 },
        ]);
    });

    it("waits until the pointer reaches the next free horizontal wall slot", () => {
        const start = { x: 2, y: 4 };

        expect(getWallDragTiles(start, { x: 3, y: 5 }, "horizontal")).toEqual([start]);
        expect(getWallDragTiles(start, { x: 4, y: 5 }, "horizontal")).toEqual([start, { x: 4, y: 4 }]);
    });

    it("uses a turned diagonal preview and fills every diagonal cell", () => {
        const start = { x: 4, y: 4 };
        const orientation = getWallDragOrientation(start, { x: 7, y: 2 }, true);
        expect(orientation).toBe("diagonal-up");
        expect(getWallDragTiles(start, { x: 7, y: 2 }, orientation)).toEqual([
            { x: 4, y: 4 },
            { x: 5, y: 3 },
            { x: 6, y: 2 },
            { x: 7, y: 1 },
        ]);
    });

    it("keeps the same diagonal when dragging it backwards", () => {
        const start = { x: 4, y: 4 };
        const orientation = getWallDragOrientation(start, { x: 1, y: 1 }, true);
        expect(orientation).toBe("diagonal-down");
        const tiles = getWallDragTiles(start, { x: 1, y: 1 }, orientation);
        expect(tiles[tiles.length - 1]).toEqual({ x: 1, y: 1 });
    });

    it("caps pathological drags", () => {
        expect(getWallDragTiles({ x: 0, y: 0 }, { x: 100, y: 0 }, "horizontal", 3)).toHaveLength(3);
    });
});
