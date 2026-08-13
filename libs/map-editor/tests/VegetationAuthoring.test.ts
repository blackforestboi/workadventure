import { describe, expect, it } from "vitest";
import {
    normalizeVegetationRectangle,
    planVegetation,
    VEGETATION_MAX_SELECTION_TILES,
    type VegetationPlanningInput,
} from "../src";

const treeRef = { collectionName: "nature", id: "pine" };
const grassRef = { collectionName: "nature", id: "grass" };

function input(overrides: Partial<VegetationPlanningInput> = {}): VegetationPlanningInput {
    return {
        seed: "forest-1",
        rectangle: { x: 0, y: 0, width: 4, height: 4 },
        preset: {
            version: 1,
            id: "forest",
            name: "Forest",
            revision: 1,
            density: 0.75,
            minimumSpacing: 1,
            species: [
                { prefabRef: treeRef, weight: 3 },
                { prefabRef: grassRef, weight: 1 },
            ],
        },
        species: [
            {
                prefabRef: treeRef,
                footprintWidth: 1,
                footprintHeight: 1,
                displayWidthInTiles: 1,
                displayHeightInTiles: 2,
                blocking: true,
            },
            {
                prefabRef: grassRef,
                footprintWidth: 1,
                footprintHeight: 1,
                displayWidthInTiles: 1,
                displayHeightInTiles: 1,
                blocking: false,
            },
        ],
        ...overrides,
    };
}

describe("vegetation authoring", () => {
    it("normalizes rectangle drags in either direction", () => {
        expect(normalizeVegetationRectangle({ startX: 4, startY: 3, endX: 2, endY: 1 })).toEqual({
            x: 2,
            y: 1,
            width: 3,
            height: 3,
        });
    });

    it("returns the exact same placements and digest for the same seed", () => {
        expect(planVegetation(input())).toEqual(planVegetation(input()));
    });

    it("keeps a blocking footprint independent from the rendered tree height", () => {
        const result = planVegetation(
            input({
                rectangle: { x: 2, y: 3, width: 1, height: 1 },
                preset: {
                    ...input().preset,
                    density: 1,
                    minimumSpacing: 0,
                    species: [{ prefabRef: treeRef, weight: 1 }],
                },
            }),
        );

        expect(result.placements[0]).toMatchObject({ width: 32, height: 64 });
    });

    it("resolves tile candidates to ordinary world-space entity coordinates", () => {
        const result = planVegetation(
            input({
                rectangle: { x: 2, y: 3, width: 1, height: 1 },
                preset: {
                    ...input().preset,
                    density: 1,
                    minimumSpacing: 0,
                    species: [{ prefabRef: grassRef, weight: 1 }],
                },
                species: [
                    {
                        prefabRef: grassRef,
                        footprintWidth: 2,
                        footprintHeight: 1,
                        displayWidthInTiles: 2,
                        displayHeightInTiles: 1,
                        blocking: false,
                    },
                ],
            }),
        );
        expect(result.placements[0]).toMatchObject({ x: 80, y: 128, width: 64, height: 32 });
    });

    it("changes the resolved plan when the seed changes", () => {
        expect(planVegetation(input({ seed: "forest-1" })).digest).not.toBe(
            planVegetation(input({ seed: "forest-2" })).digest,
        );
    });

    it("skips blocking vegetation on blocked cells while allowing nonblocking species", () => {
        const result = planVegetation(
            input({
                seed: "blocked",
                rectangle: { x: 0, y: 0, width: 1, height: 1 },
                preset: { ...input().preset, density: 1, species: [{ prefabRef: treeRef, weight: 1 }] },
                blockedCells: [{ x: 0, y: 0, reason: "collision" }],
            }),
        );
        expect(result.placements).toHaveLength(0);
        expect(result.skipped).toEqual([{ x: 0, y: 0, reason: "collision" }]);
    });

    it("rejects oversized selections", () => {
        expect(() =>
            planVegetation(input({ rectangle: { x: 0, y: 0, width: VEGETATION_MAX_SELECTION_TILES + 1, height: 1 } })),
        ).toThrow(/cannot exceed/);
    });

    it("rejects presets whose species are unavailable", () => {
        expect(() => planVegetation(input({ species: [] }))).toThrow(/unavailable species/);
    });
});
