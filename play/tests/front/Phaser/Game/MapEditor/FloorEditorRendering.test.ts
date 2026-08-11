import { describe, expect, it } from "vitest";

import {
    findTilesetForGid,
    tileLayerCanRenderGid,
    type TileIndexSet,
} from "../../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorRendering";

function tileset(firstGid: number, tileCount: number): TileIndexSet {
    return {
        containsTileIndex: (gid) => gid >= firstGid && gid < firstGid + tileCount,
    };
}

describe("floor editor rendering", () => {
    const stone = tileset(1, 100);
    const grass = tileset(101, 100);

    it("uses an overlay when a GPU layer cannot render the selected tileset", () => {
        expect(tileLayerCanRenderGid({ tileset: stone }, 118)).toBe(false);
        expect(findTilesetForGid([stone, grass], 118)).toBe(grass);
    });

    it("keeps native rendering when the layer already supports the selected tile", () => {
        expect(tileLayerCanRenderGid({ tileset: stone }, 18)).toBe(true);
        expect(tileLayerCanRenderGid({ tileset: [stone, grass] }, 118)).toBe(true);
    });
});
