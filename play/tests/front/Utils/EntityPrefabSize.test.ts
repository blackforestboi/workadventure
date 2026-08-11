import { describe, expect, it } from "vitest";

import { getEntityDisplaySize } from "../../../src/front/Utils/EntityPrefabSize";

describe("entity prefab default size", () => {
    it.each([
        [0.5, 16],
        [1, 32],
        [100, 3200],
    ])("maps %s tiles to %spx while preserving aspect ratio", (tiles, width) => {
        expect(getEntityDisplaySize(512, 256, tiles)).toEqual({ width, height: width / 2 });
    });

    it("keeps legacy natural dimensions when no default is stored", () => {
        expect(getEntityDisplaySize(512, 256, undefined)).toEqual({ width: 512, height: 256 });
    });
});
