import { describe, expect, it } from "vitest";
import {
    createWallFoundationCollisionGrid,
    getWallPlacementSize,
    getWallDragOrientation,
    getWallDragTiles,
    getWallProjectionRise,
    snapWorldPointToWallTile,
} from "../src";

describe("wall authoring", () => {
    it("uses a 2x2 horizontal, 0x2 vertical, and 1x2 diagonal footprint", () => {
        expect(getWallPlacementSize("horizontal")).toEqual({ widthInTiles: 2, heightInTiles: 2 });
        expect(getWallPlacementSize("vertical")).toEqual({ widthInTiles: 0, heightInTiles: 2 });
        expect(getWallPlacementSize("diagonal-up")).toEqual({ widthInTiles: 1, heightInTiles: 2 });
        expect(getWallPlacementSize("diagonal-down")).toEqual({ widthInTiles: 1, heightInTiles: 2 });
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

    it("locks a mostly horizontal drag to one gap-free row", () => {
        const start = { x: 2, y: 4 };
        const current = { x: 6, y: 5 };
        const orientation = getWallDragOrientation(start, current, false);
        expect(orientation).toBe("horizontal");
        expect(getWallDragTiles(start, current, orientation)).toEqual([
            { x: 2, y: 4 },
            { x: 3, y: 4 },
            { x: 4, y: 4 },
            { x: 5, y: 4 },
            { x: 6, y: 4 },
        ]);
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

    it("derives a stable half-tile perspective rise", () => {
        expect(getWallProjectionRise(32, 0.5)).toBe(16);
    });
});
