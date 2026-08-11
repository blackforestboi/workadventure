import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import { applyTeapotTilePatch } from "../../src/Authoring/TeapotTilePatch";
import { createCenteredMap } from "../../src/GameMap/CenteredMapCoordinates";
import { GameMap } from "../../src/GameMap/GameMap";

function createMap(): ITiledMap {
    return createCenteredMap({
        orientation: "orthogonal",
        infinite: false,
        width: 2,
        height: 2,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            {
                id: 1,
                name: "floor",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [1, 2, 3, 4],
                opacity: 1,
                visible: true,
            },
        ],
        tilesets: [
            {
                firstgid: 1,
                name: "terrain",
                image: "terrain.png",
                imagewidth: 128,
                imageheight: 32,
                tilewidth: 32,
                tileheight: 32,
                tilecount: 4,
                columns: 4,
                margin: 0,
                spacing: 0,
            },
        ],
    } as unknown as ITiledMap);
}

describe("GameMap centered coordinates", () => {
    it("maps both negative and positive world positions into its dense runtime grid", () => {
        const gameMap = new GameMap(createMap());

        expect(gameMap.getMapBounds()).toEqual({ x: -32, y: -32, width: 64, height: 64 });
        expect(gameMap.getTileIndexAt(-16, -16)).toEqual({ x: 0, y: 0 });
        expect(gameMap.getTileIndexAt(16, 16)).toEqual({ x: 1, y: 1 });
    });

    it("synchronizes expanded chunks without rebasing the world origin", () => {
        const source = createMap();
        const gameMap = new GameMap(source);
        const updated = applyTeapotTilePatch(source, {
            mapId: "world",
            expectedRevision: 0,
            regions: [{ layer: "floor", x: -3, y: -2, width: 1, height: 1, gids: [4] }],
        }).map;

        gameMap.synchronizeTileLayers(updated);

        expect(gameMap.getMapBounds().x).toBeLessThan(-32);
        expect(gameMap.getTileIndexAt(-16, -16)).toEqual({ x: 16, y: 16 });
        expect(gameMap.getTileIndexAt(-80, -48)).toEqual({ x: 14, y: 15 });
    });
});
