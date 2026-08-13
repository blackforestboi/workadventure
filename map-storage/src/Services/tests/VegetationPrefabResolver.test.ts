import type { WamFile } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";
import { assertVegetationPrefabReferences } from "../VegetationPrefabResolver";

vi.mock("../../fileSystem", () => ({ fileSystem: {} }));
vi.mock("../PathMapper", () => ({ mapPathUsingDomainWithPrefix: (filePath: string) => filePath }));

function emptyWamFile(): WamFile {
    return {
        getWam: () => ({
            version: "1.0.0",
            mapUrl: "./world.tmj",
            entities: {},
            areas: [],
            entityCollections: [],
        }),
    } as unknown as WamFile;
}

describe("assertVegetationPrefabReferences", () => {
    it("accepts a known built-in Craftpix vegetation prefab without a map-owned collection", async () => {
        await expect(
            assertVegetationPrefabReferences(emptyWamFile(), new URL("https://maps.example.test/world.wam"), [
                {
                    collectionName: "Craftpix Nature & Ruins",
                    id: "craftpix-trees-autumn-tree1",
                },
            ]),
        ).resolves.toBeUndefined();
    });

    it("rejects an unknown prefab that merely claims the built-in collection name", async () => {
        await expect(
            assertVegetationPrefabReferences(emptyWamFile(), new URL("https://maps.example.test/world.wam"), [
                {
                    collectionName: "Craftpix Nature & Ruins",
                    id: "craftpix-trees-does-not-exist",
                },
            ]),
        ).rejects.toThrow("does not exist");
    });
});
