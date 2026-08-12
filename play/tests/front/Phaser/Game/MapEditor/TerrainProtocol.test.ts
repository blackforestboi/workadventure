import { EditMapMessage } from "@workadventure/messages";
import { describe, expect, it } from "vitest";

describe("terrain edit protocol", () => {
    it("round-trips negative tile coordinates through the map edit envelope", () => {
        const encoded = EditMapMessage.encode({
            message: {
                $case: "modifyTerrainMessage",
                modifyTerrainMessage: {
                    mapUrl: "https://example.test/map.tmj",
                    regions: [{ layer: "floor", x: -17, y: -23, width: 2, height: 1, gids: [4, 5] }],
                    tilesetJson: "",
                    removeTileset: false,
                    layerJson: '{"name":"water"}',
                    removeLayer: false,
                    beforeLayer: "floor",
                },
            },
        }).finish();
        const decoded = EditMapMessage.decode(encoded);

        expect(decoded.message?.$case).toBe("modifyTerrainMessage");
        if (decoded.message?.$case !== "modifyTerrainMessage") throw new Error("Expected terrain edit");
        expect(decoded.message.modifyTerrainMessage.regions[0]).toMatchObject({ x: -17, y: -23 });
        expect(decoded.message.modifyTerrainMessage).toMatchObject({
            layerJson: '{"name":"water"}',
            removeLayer: false,
            beforeLayer: "floor",
        });
        expect("prependLeft" in decoded.message.modifyTerrainMessage).toBe(false);
        expect("prependTop" in decoded.message.modifyTerrainMessage).toBe(false);
    });
});
