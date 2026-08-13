import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { EntityCollectionRaw } from "@workadventure/map-editor";
import { describe, expect, it } from "vitest";

const collectionDirectory = path.resolve(__dirname, "../../../public/collections/CraftpixNature");

describe("Craftpix Nature collection", () => {
    it("contains valid, uniquely named placeable prefabs with existing image files", async () => {
        const raw = JSON.parse(await readFile(path.join(collectionDirectory, "CraftpixNatureCollection.json"), "utf8"));
        const collection = EntityCollectionRaw.parse(raw);

        expect(collection.collection.length).toBe(300);
        expect(new Set(collection.collection.map(({ id }) => id)).size).toBe(collection.collection.length);
        expect(collection.collection.every(({ id, name }) => id.length > 0 && name.length > 0)).toBe(true);
        expect(collection.collection.filter(({ vegetation }) => vegetation !== undefined).length).toBeGreaterThan(150);

        const trees = collection.collection.filter(({ vegetation }) => vegetation?.category === "tree");
        expect(trees.length).toBeGreaterThan(60);
        expect(
            trees.every(
                ({ collisionGrid }) =>
                    collisionGrid !== undefined && collisionGrid.flat().filter((cell) => cell === 1).length === 1,
            ),
        ).toBe(true);
        expect(trees.filter(({ id }) => id.startsWith("craftpix-forest-living-gazebo")).map(({ id }) => id)).toEqual([
            "craftpix-forest-living-gazebo1",
            "craftpix-forest-living-gazebo2",
        ]);

        await Promise.all(
            collection.collection.map(async ({ imagePath }) => {
                expect((await stat(path.join(collectionDirectory, imagePath))).isFile()).toBe(true);
            }),
        );
    });
});
