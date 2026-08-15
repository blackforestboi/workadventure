import { describe, expect, it } from "vitest";

import { resolveTilesetImageUrl } from "../../../../../src/front/Phaser/Game/GameMap/TilesetImageUrl";

describe("resolveTilesetImageUrl", () => {
    const mapUrl = "http://map-storage.workadventure.localhost/maps/areas.tmj";
    const playOrigin = "http://play.workadventure.localhost";

    it("loads the bundled terrain atlas from Play for legacy and new saved maps", () => {
        expect(resolveTilesetImageUrl("/resources/tilesets/lpc-outdoor-terrain.png", mapUrl, playOrigin)).toBe(
            "http://play.workadventure.localhost/resources/tilesets/lpc-outdoor-terrain.png",
        );
        expect(
            resolveTilesetImageUrl(
                "http://play.workadventure.localhost/resources/tilesets/lpc-outdoor-terrain.png",
                mapUrl,
                playOrigin,
            ),
        ).toBe("http://play.workadventure.localhost/resources/tilesets/lpc-outdoor-terrain.png");
        expect(
            resolveTilesetImageUrl(
                "/collections/CraftpixSummer/assets/terrain/craftpix-summer-terrain.png",
                mapUrl,
                playOrigin,
            ),
        ).toBe(
            "http://play.workadventure.localhost/collections/CraftpixSummer/assets/terrain/craftpix-summer-terrain.png",
        );
        expect(
            resolveTilesetImageUrl("/collections/WorkAdventureLegacy/assets/Floor0/walls2.png", mapUrl, playOrigin),
        ).toBe("http://play.workadventure.localhost/collections/WorkAdventureLegacy/assets/Floor0/walls2.png");
    });

    it("resolves regular map assets against the map URL", () => {
        expect(resolveTilesetImageUrl("../assets/tileset.png", mapUrl, playOrigin)).toBe(
            "http://map-storage.workadventure.localhost/assets/tileset.png",
        );
    });
});
