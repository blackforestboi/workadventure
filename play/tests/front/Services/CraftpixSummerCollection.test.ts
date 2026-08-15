import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { BUILT_IN_ENTITY_COLLECTIONS, EntityCollectionRaw } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";

const collectionDirectory = path.resolve(__dirname, "../../../public/collections/CraftpixSummer");

describe("Craftpix Summer RPG collection", () => {
    it("contains valid, uniquely named placeable prefabs with existing image files", async () => {
        const raw = JSON.parse(await readFile(path.join(collectionDirectory, "CraftpixSummerCollection.json"), "utf8"));
        const collection = EntityCollectionRaw.parse(raw);

        expect(collection.defaultDimensionsControlDisplay).toBe(true);

        expect(collection.collection).toHaveLength(55);
        expect(new Set(collection.collection.map(({ id }) => id))).toHaveLength(55);
        expect(new Set(collection.collection.map(({ name }) => name))).toHaveLength(55);
        expect(collection.collection.filter(({ id }) => id.startsWith("craftpix-summer-building-"))).toHaveLength(7);
        expect(collection.collection.filter(({ vegetation }) => vegetation !== undefined)).toHaveLength(25);
        expect(
            Object.fromEntries(
                collection.collection
                    .flatMap(({ tags }) => tags.filter((tag) => tag.startsWith("size-")))
                    .reduce((counts, sizeClass) => {
                        counts.set(sizeClass, (counts.get(sizeClass) ?? 0) + 1);
                        return counts;
                    }, new Map<string, number>()),
            ),
        ).toEqual({
            "size-building": 6,
            "size-canopy-tree": 12,
            "size-medium": 11,
            "size-compact": 10,
            "size-ground-detail": 3,
            "size-low-vegetation": 13,
        });
        expect(
            collection.collection.every(({ tags }) => tags.filter((tag) => tag.startsWith("size-")).length === 1),
        ).toBe(true);
        expect(BUILT_IN_ENTITY_COLLECTIONS).toContainEqual(
            expect.objectContaining({
                collectionName: "Craftpix Summer RPG",
                urlPath: "/collections/CraftpixSummer/CraftpixSummerCollection.json",
                prefabIds: expect.arrayContaining(collection.collection.map(({ id }) => id)),
            }),
        );

        const buildings = collection.collection.filter(({ tags }) => tags.includes("size-building"));
        expect(
            buildings.every(
                ({ defaultSizeInTiles, defaultHeightInTiles }) =>
                    defaultSizeInTiles !== undefined &&
                    defaultHeightInTiles !== undefined &&
                    defaultSizeInTiles <= 3 &&
                    defaultHeightInTiles <= 3,
            ),
        ).toBe(true);

        const ordinaryObjects = collection.collection.filter(({ tags }) => !tags.includes("size-building"));
        expect(
            ordinaryObjects.every(
                ({ defaultHeightInTiles }) => defaultHeightInTiles !== undefined && defaultHeightInTiles <= 2,
            ),
        ).toBe(true);

        const trees = collection.collection.filter(({ tags }) => tags.includes("size-canopy-tree"));
        expect(trees).toHaveLength(12);
        expect(
            trees.every(
                ({ defaultHeightInTiles, vegetation }) => defaultHeightInTiles === 2 && vegetation?.category === "tree",
            ),
        ).toBe(true);
        expect(
            trees.every(
                ({ collisionGrid }) =>
                    collisionGrid !== undefined && collisionGrid.flat().filter((cell) => cell === 1).length === 1,
            ),
        ).toBe(true);

        const stumps = collection.collection.filter(({ name }) => name.includes("Stump"));
        expect(stumps).toHaveLength(3);
        expect(
            stumps.every(
                ({ collisionGrid, defaultSizeInTiles, defaultHeightInTiles, vegetation }) =>
                    defaultSizeInTiles !== undefined &&
                    defaultHeightInTiles !== undefined &&
                    defaultSizeInTiles <= 1 &&
                    defaultHeightInTiles <= 1 &&
                    vegetation?.category === "other" &&
                    collisionGrid?.length === 1 &&
                    collisionGrid[0]?.length === 1 &&
                    collisionGrid[0][0] === 1,
            ),
        ).toBe(true);

        expect(
            collection.collection.every(({ collisionGrid, defaultSizeInTiles, defaultHeightInTiles }) => {
                if (
                    collisionGrid === undefined ||
                    defaultSizeInTiles === undefined ||
                    defaultHeightInTiles === undefined
                ) {
                    return true;
                }
                const collisionColumns = Math.max(0, ...collisionGrid.map((row) => row.length));
                return (
                    collisionGrid.length <= Math.ceil(defaultHeightInTiles) &&
                    collisionColumns <= Math.ceil(defaultSizeInTiles)
                );
            }),
        ).toBe(true);

        await Promise.all(
            collection.collection.map(async ({ defaultHeightInTiles, defaultSizeInTiles, imagePath }) => {
                const absoluteImagePath = path.join(collectionDirectory, imagePath);
                expect((await stat(absoluteImagePath)).isFile()).toBe(true);
                const png = await readFile(absoluteImagePath);
                const naturalAspectRatio = png.readUInt32BE(16) / png.readUInt32BE(20);
                const placedAspectRatio = (defaultSizeInTiles ?? 1) / (defaultHeightInTiles ?? 1);
                expect(Math.abs(placedAspectRatio / naturalAspectRatio - 1)).toBeLessThan(0.02);
            }),
        );
    });
});
