import { describe, expect, it } from "vitest";
import { getCustomEntityCollectionUrl } from "../../../src/front/Utils/CustomEntityCollectionUrl";

describe("getCustomEntityCollectionUrl", () => {
    it("preserves the map-storage prefix when resolving the custom entity collection", () => {
        expect(getCustomEntityCollectionUrl("https://tpot.world/~/maps/areas.wam", "/map-storage")).toBe(
            "https://tpot.world/map-storage/assets/entities/entities.json",
        );
    });
});
