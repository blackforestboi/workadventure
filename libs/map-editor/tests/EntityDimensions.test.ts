import { describe, expect, it } from "vitest";
import { UpdateEntityCommand, WamFile, WAMEntityData, type WAMFileFormat } from "../src";

describe("WAMEntityData dimensions", () => {
    const entity = {
        x: 10,
        y: 20,
        prefabRef: { id: "chair", collectionName: "furniture" },
    };

    it("preserves optional resized dimensions", () => {
        expect(WAMEntityData.parse({ ...entity, width: 96, height: 48 })).toMatchObject({
            width: 96,
            height: 48,
        });
    });

    it("rejects zero-sized objects", () => {
        expect(() => WAMEntityData.parse({ ...entity, width: 0, height: 48 })).toThrow();
    });

    it("persists resized dimensions for a generic prefab update", async () => {
        const wam: WAMFileFormat = {
            version: "1.0.0",
            mapUrl: "https://example.test/map.json",
            entities: { chair: entity },
            areas: [],
            entityCollections: [],
        };
        const file = new WamFile(wam);

        await new UpdateEntityCommand(file, "chair", { width: 96, height: 48 }).execute();

        expect(file.getGameMapEntities().getEntity("chair")).toMatchObject({ width: 96, height: 48 });
    });
});
