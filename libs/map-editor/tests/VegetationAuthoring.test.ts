import { describe, expect, it } from "vitest";
import { normalizeVegetationRectangle, planVegetation, type VegetationPlanningInput } from "../src";

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
        expect(result.placements[0]).toMatchObject({ width: 64, height: 32 });
        expect(result.placements[0].x).toBeGreaterThan(2 * 32);
        expect(result.placements[0].x).toBeLessThan(3 * 32);
        expect(result.placements[0].y).toBeGreaterThan(3 * 32);
        expect(result.placements[0].y).toBeLessThan(4.5 * 32);
    });

    it("creates a denser organic distribution instead of exposing the tile raster", () => {
        const result = planVegetation(
            input({
                rectangle: { x: 0, y: 0, width: 4, height: 4 },
                preset: {
                    ...input().preset,
                    density: 1,
                    minimumSpacing: 0,
                    species: [{ prefabRef: treeRef, weight: 1 }],
                },
            }),
        );

        expect(result.placements.length).toBeGreaterThan(16);
        expect(result.placements.some(({ x }) => x % 32 !== 16)).toBe(true);
        expect(result.placements.some(({ y }) => y % 32 !== 0)).toBe(true);
    });

    it("keeps randomized placements at least the requested distance apart", () => {
        const minimumSpacing = 1.5;
        const result = planVegetation(
            input({
                rectangle: { x: 0, y: 0, width: 8, height: 8 },
                preset: {
                    ...input().preset,
                    density: 1,
                    minimumSpacing,
                    species: [{ prefabRef: treeRef, weight: 1 }],
                },
            }),
        );

        expect(result.placements.length).toBeGreaterThan(16);
        for (const [index, placement] of result.placements.entries()) {
            for (const other of result.placements.slice(index + 1)) {
                expect(Math.hypot((placement.x - other.x) / 32, (placement.y - other.y) / 32)).toBeGreaterThanOrEqual(
                    minimumSpacing,
                );
            }
        }
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

    it("plans selections larger than 64 by 64 tiles within the placement cap", () => {
        const result = planVegetation(input({ rectangle: { x: 0, y: 0, width: 65, height: 65 } }));

        expect(result.rectangle).toEqual({ x: 0, y: 0, width: 65, height: 65 });
        expect(result.placements.length).toBeGreaterThan(0);
        expect(result.placements.length).toBeLessThanOrEqual(500);
    });

    it("rejects presets whose species are unavailable", () => {
        expect(() => planVegetation(input({ species: [] }))).toThrow(/unavailable species/);
    });
});
