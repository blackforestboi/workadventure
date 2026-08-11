import { describe, expect, it } from "vitest";
import {
    reverseEntityCollisionGrid,
    scaleEntityCollisionGrid,
} from "../../../../../src/front/Phaser/Game/MapEditor/Entities/EntityCollisionGrid";

describe("EntityCollisionGrid", () => {
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
});
