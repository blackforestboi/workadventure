import { describe, expect, it } from "vitest";
import { WAMEntityData } from "../src/types";

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
});
