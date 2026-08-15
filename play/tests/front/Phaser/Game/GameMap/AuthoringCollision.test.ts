import {
    applyTeapotTilePatch,
    createCenteredMap,
    getTileLayerGid,
    surfaceOverlayLayerName,
    TeapotTilePatch,
} from "@workadventure/map-editor";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

import {
    BUILT_IN_SUMMER_TERRAIN_ASSETS,
    BUILT_IN_SUMMER_TERRAIN_TILESET,
    BUILT_IN_TERRAIN_ASSETS,
    BUILT_IN_TERRAIN_TILESET,
} from "../../../../../src/front/Services/BuiltInTerrainCatalog";
import { PathTileType } from "../../../../../src/front/Utils/PathfindingManager";
import {
    appendDefaultCollisionRegions,
    appendWaterCollisionRegions,
    composeCollisionGrid,
    containsOccupiedVisualTileDeletion,
    findAuthoringPathBrushGid,
    findCollisionBrushGid,
    getAuthoringCollisionGrid,
    getAuthoringPathOverlay,
    getCollisionOverlayCells,
    getPhysicalTileCollisionMode,
    getTileSupportGrid,
    isAuthoringCollisionLayer,
    isCollisionStorageLayer,
    tileHasDefaultCollision,
} from "../../../../../src/front/Phaser/Game/GameMap/AuthoringCollision";

describe("authoring collision", () => {
    it("uses the dedicated collision layer as the sole map-level physical collision source", () => {
        expect(getPhysicalTileCollisionMode("collisions", true)).toBe("occupied");
        expect(getPhysicalTileCollisionMode("floor", true)).toBe("disabled");
        expect(getPhysicalTileCollisionMode("walls", true)).toBe("disabled");
        expect(getPhysicalTileCollisionMode("collision 2", true)).toBe("disabled");
        expect(getPhysicalTileCollisionMode("__entitiesCollisionLayer", true)).toBe("properties");
        expect(getPhysicalTileCollisionMode("__voidCollisionLayer", true)).toBe("properties");
        expect(getPhysicalTileCollisionMode("floor", false)).toBe("properties");
    });

    it("recognizes only the primary collision layer aliases", () => {
        expect(isAuthoringCollisionLayer("Collisions")).toBe(true);
        expect(isAuthoringCollisionLayer("collision 1")).toBe(true);
        expect(isAuthoringCollisionLayer("collision 2")).toBe(false);
        expect(isAuthoringCollisionLayer("entityCollision")).toBe(false);
        expect(isCollisionStorageLayer("Collisions")).toBe(true);
        expect(isCollisionStorageLayer("collision 2")).toBe(true);
        expect(isCollisionStorageLayer("floor")).toBe(false);
    });

    it("derives support only from visible visual layers with nonzero tiles", () => {
        const map = collisionMap();
        map.layers[0] = {
            id: 1,
            name: "floor",
            type: "tilelayer",
            width: 2,
            height: 2,
            data: [102, 0, 0, 0],
            opacity: 1,
            visible: true,
        };
        map.layers.push(
            {
                id: 3,
                name: "hidden floor",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [0, 102, 0, 0],
                opacity: 1,
                visible: false,
            },
            {
                id: 4,
                name: "exit",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [0, 0, 102, 0],
                opacity: 1,
                visible: true,
            },
            {
                id: 5,
                name: "start",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [0, 0, 0, 102],
                opacity: 1,
                visible: true,
            },
            {
                id: 6,
                name: "decoration",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [0, 102, 0, 0],
                opacity: 1,
                visible: true,
            },
            {
                id: 7,
                name: "__entitiesCollisionLayer",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [0, 0, 102, 0],
                opacity: 1,
                visible: true,
            },
            {
                id: 8,
                name: surfaceOverlayLayerName("floor", 102, "placement-1"),
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [0, 0, 102, 0],
                opacity: 1,
                visible: true,
            },
        );

        expect(getTileSupportGrid(map)).toEqual([
            [true, true],
            [true, false],
        ]);
    });

    it("updates support when the last visual tile is erased, repainted, or hidden", () => {
        const map = collisionMap();
        const floor = tileLayer(map, "floor");

        expect(getTileSupportGrid(map)[0][0]).toBe(true);
        if (!Array.isArray(floor.data)) throw new Error("Expected a finite floor layer");
        floor.data[0] = 0;
        expect(getTileSupportGrid(map)[0][0]).toBe(false);
        floor.data[0] = 102;
        expect(getTileSupportGrid(map)[0][0]).toBe(true);
        floor.visible = false;
        expect(getTileSupportGrid(map)[0][0]).toBe(false);
    });

    it("detects only occupied zero-GID writes to visual layers", () => {
        const occupied = [{ x: 2, y: 3 }];

        expect(
            containsOccupiedVisualTileDeletion(
                [{ layer: "floor", x: 1, y: 3, width: 2, height: 1, gids: [102, 0] }],
                occupied,
            ),
        ).toBe(true);
        expect(
            containsOccupiedVisualTileDeletion(
                [{ layer: "floor", x: 2, y: 3, width: 1, height: 1, gids: [103] }],
                occupied,
            ),
        ).toBe(false);
        expect(
            containsOccupiedVisualTileDeletion(
                [{ layer: "collisions", x: 2, y: 3, width: 1, height: 1, gids: [0] }],
                occupied,
            ),
        ).toBe(false);
        expect(
            containsOccupiedVisualTileDeletion(
                [{ layer: "start 1", x: 2, y: 3, width: 1, height: 1, gids: [0] }],
                occupied,
            ),
        ).toBe(false);
        expect(
            containsOccupiedVisualTileDeletion(
                [{ layer: "floor", x: 1, y: 3, width: 1, height: 1, gids: [0] }],
                occupied,
            ),
        ).toBe(false);
    });

    it("uses a dedicated collision layer to override collidable visual tiles", () => {
        const grid = composeCollisionGrid(3, 1, [
            {
                kind: "regular",
                visible: true,
                grid: [[PathTileType.Collider, PathTileType.Collider, PathTileType.Exit]],
            },
            {
                kind: "authoring-collision",
                visible: false,
                grid: [[PathTileType.Walkable, PathTileType.Collider, PathTileType.Walkable]],
            },
        ]);

        expect(grid).toEqual([[PathTileType.Walkable, PathTileType.Collider, PathTileType.Exit]]);
    });

    it("keeps legacy tile collisions when no dedicated collision layer exists", () => {
        const grid = composeCollisionGrid(1, 1, [{ kind: "regular", visible: true, grid: [[PathTileType.Collider]] }]);

        expect(grid).toEqual([[PathTileType.Collider]]);
    });

    it("keeps live entity collisions after map-level collision overrides", () => {
        const grid = composeCollisionGrid(1, 1, [
            { kind: "regular", visible: true, grid: [[PathTileType.Collider]] },
            { kind: "authoring-collision", visible: true, grid: [[PathTileType.Walkable]] },
            { kind: "dynamic-collision", visible: false, grid: [[PathTileType.Collider]] },
        ]);

        expect(grid).toEqual([[PathTileType.Collider]]);
    });

    it("treats every occupied collision-layer cell as state, regardless of the marker tile properties", () => {
        const map = collisionMap();

        expect(findCollisionBrushGid(map, "collisions")).toBe(101);
        expect(tileHasDefaultCollision(map, 101)).toBe(true);
        expect(tileHasDefaultCollision(map, 102)).toBe(false);
        expect(getCollisionOverlayCells(map, "collisions")).toEqual([
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
        ]);
        expect(getAuthoringPathOverlay(map, "collisions")).toEqual({
            kind: "collision",
            cells: [
                { x: 0, y: 0 },
                { x: 1, y: 0 },
                { x: 0, y: 1 },
            ],
        });

        expect(getAuthoringCollisionGrid(createCenteredMap(map))).toEqual([
            [PathTileType.Collider, PathTileType.Collider],
            [PathTileType.Collider, PathTileType.Walkable],
        ]);
    });

    it("can store collision state even when no tileset tile has a collides property", () => {
        const map = collisionMap();
        const collisionLayer = map.layers[1];
        if (collisionLayer.type !== "tilelayer" || !Array.isArray(collisionLayer.data)) {
            throw new Error("Expected the collision fixture to contain a finite tile layer");
        }
        collisionLayer.data.fill(0);
        const collisionTileset = map.tilesets[0];
        if ("tiles" in collisionTileset) collisionTileset.tiles = [];

        expect(findCollisionBrushGid(map, "collisions")).toBe(101);
    });

    it("returns only the selected exit or start layer cells for authoring overlays", () => {
        const map = collisionMap();
        map.layers.push(
            {
                id: 3,
                name: "exit",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [103, 0, 0, 103],
                opacity: 1,
                visible: true,
            },
            {
                id: 4,
                name: "start 1",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [0, 104, 0, 0],
                opacity: 1,
                visible: true,
            },
        );

        expect(getAuthoringPathOverlay(map, "exit")).toEqual({
            kind: "exit",
            cells: [
                { x: 0, y: 0 },
                { x: 1, y: 1 },
            ],
        });
        expect(getAuthoringPathOverlay(map, "start 1")).toEqual({
            kind: "start",
            cells: [{ x: 1, y: 0 }],
        });
        expect(findAuthoringPathBrushGid(map, "exit")).toBe(103);
        expect(findAuthoringPathBrushGid(map, "start 1")).toBe(104);
        expect(getAuthoringPathOverlay(map, "floor")).toBeUndefined();
        expect(getAuthoringPathOverlay(map, "start 2")).toBeUndefined();
    });

    it("copies a collidable asset default into the independent collision layer", () => {
        const regions = appendDefaultCollisionRegions(collisionMap(), [
            { layer: "floor", x: 0, y: 0, width: 2, height: 1, gids: [101, 102] },
        ]);

        expect(regions).toEqual([
            { layer: "floor", x: 0, y: 0, width: 2, height: 1, gids: [101, 102] },
            { layer: "collisions", x: 0, y: 0, width: 1, height: 1, gids: [101] },
        ]);
    });

    it("adds collision only to visible water, not its under-cover halo", () => {
        const regions = appendWaterCollisionRegions(
            collisionMap(),
            [
                {
                    layer: "__teapot_water_underlay__floor",
                    x: 0,
                    y: 0,
                    width: 3,
                    height: 1,
                    gids: [688, 688, 688],
                },
            ],
            [{ x: 1, y: 0 }],
        );

        expect(regions).toEqual([
            {
                layer: "__teapot_water_underlay__floor",
                x: 0,
                y: 0,
                width: 3,
                height: 1,
                gids: [688, 688, 688],
            },
            { layer: "collisions", x: 1, y: 0, width: 1, height: 1, gids: [101] },
        ]);
    });

    it("does not add collision side effects for exit or start edits", () => {
        const regions = [
            { layer: "exit", x: 0, y: 0, width: 1, height: 1, gids: [101] },
            { layer: "start 1", x: 1, y: 0, width: 1, height: 1, gids: [101] },
        ];

        expect(appendDefaultCollisionRegions(collisionMap(), regions)).toEqual(regions);
    });

    it("honors solid defaults from the built-in terrain catalog", () => {
        const solidAsset = BUILT_IN_TERRAIN_ASSETS.find((asset) => asset.solid);
        expect(solidAsset).toBeDefined();
        const map = collisionMap();
        map.tilesets.push({
            firstgid: 200,
            name: BUILT_IN_TERRAIN_TILESET.name,
            tilewidth: 32,
            tileheight: 32,
            tilecount: BUILT_IN_TERRAIN_TILESET.columns * BUILT_IN_TERRAIN_TILESET.rows,
            columns: BUILT_IN_TERRAIN_TILESET.columns,
            image: BUILT_IN_TERRAIN_TILESET.image,
            imagewidth: BUILT_IN_TERRAIN_TILESET.width,
            imageheight: BUILT_IN_TERRAIN_TILESET.height,
        });
        const collisionLayer = map.layers[1];
        if (collisionLayer.type !== "tilelayer" || !Array.isArray(collisionLayer.data)) {
            throw new Error("Expected the collision fixture to contain a finite tile layer");
        }
        collisionLayer.data[0] = 200 + solidAsset!.tileId;

        expect(tileHasDefaultCollision(map, 200 + solidAsset!.tileId)).toBe(true);
        expect(getCollisionOverlayCells(map, "collisions")).toEqual([
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
        ]);
    });

    it("honors solid river defaults from the Craftpix Summer terrain catalog", () => {
        const riverAsset = BUILT_IN_SUMMER_TERRAIN_ASSETS.find(({ terrainType }) => terrainType === "water");
        expect(riverAsset).toBeDefined();
        const firstGid = 3000;
        const map = collisionMap();
        map.tilesets.push({
            firstgid: firstGid,
            name: BUILT_IN_SUMMER_TERRAIN_TILESET.name,
            tilewidth: 32,
            tileheight: 32,
            tilecount: BUILT_IN_SUMMER_TERRAIN_TILESET.tileCount,
            columns: BUILT_IN_SUMMER_TERRAIN_TILESET.columns,
            image: BUILT_IN_SUMMER_TERRAIN_TILESET.image,
            imagewidth: BUILT_IN_SUMMER_TERRAIN_TILESET.width,
            imageheight: BUILT_IN_SUMMER_TERRAIN_TILESET.height,
        });

        expect(tileHasDefaultCollision(map, firstGid + riverAsset!.tileId)).toBe(true);
    });

    it("erases only collision data and leaves every visual layer in the stack untouched", () => {
        const map = createCenteredMap(collisionMap());
        const result = applyTeapotTilePatch(
            map,
            TeapotTilePatch.parse({
                mapId: "https://example.test/map.tmj",
                expectedRevision: 0,
                regions: [{ layer: "collisions", x: 0, y: -1, width: 1, height: 1, gids: [0] }],
            }),
        ).map;

        expect(getTileLayerGid(tileLayer(result, "floor"), 0, -1)).toBe(102);
        expect(getTileLayerGid(tileLayer(result, "collisions"), 0, -1)).toBe(0);
        expect(getTileLayerGid(tileLayer(result, "collisions"), -1, 0)).toBe(101);
    });

    it("adds and removes exit or start markers without changing floor or collision tiles", () => {
        const finiteMap = collisionMap();
        finiteMap.layers.push(
            {
                id: 3,
                name: "exit",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [0, 0, 0, 0],
                opacity: 1,
                visible: true,
            },
            {
                id: 4,
                name: "start 1",
                type: "tilelayer",
                width: 2,
                height: 2,
                data: [103, 0, 0, 0],
                opacity: 1,
                visible: true,
            },
        );
        const map = createCenteredMap(finiteMap);
        const result = applyTeapotTilePatch(
            map,
            TeapotTilePatch.parse({
                mapId: "https://example.test/map.tmj",
                expectedRevision: 0,
                regions: [
                    { layer: "exit", x: 0, y: -1, width: 1, height: 1, gids: [103] },
                    { layer: "start 1", x: -1, y: -1, width: 1, height: 1, gids: [0] },
                ],
            }),
        ).map;

        expect(getTileLayerGid(tileLayer(result, "floor"), 0, -1)).toBe(102);
        expect(getTileLayerGid(tileLayer(result, "collisions"), 0, -1)).toBe(101);
        expect(getTileLayerGid(tileLayer(result, "exit"), 0, -1)).toBe(103);
        expect(getTileLayerGid(tileLayer(result, "start 1"), -1, -1)).toBe(0);
    });
});

function collisionMap(): ITiledMap {
    return {
        orientation: "orthogonal",
        infinite: false,
        width: 2,
        height: 2,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            { id: 1, name: "floor", type: "tilelayer", width: 2, height: 2, data: [102, 102, 102, 102] },
            { id: 2, name: "collisions", type: "tilelayer", width: 2, height: 2, data: [102, 101, 101, 0] },
        ],
        tilesets: [
            {
                firstgid: 101,
                name: "collision-marker",
                tilewidth: 32,
                tileheight: 32,
                tilecount: 2,
                columns: 2,
                image: "collision.png",
                imagewidth: 64,
                imageheight: 32,
                tiles: [{ id: 0, properties: [{ name: "collides", type: "bool", value: true }] }],
            },
        ],
    } as ITiledMap;
}

function tileLayer(map: ITiledMap, name: string) {
    const layer = map.layers.find((candidate) => candidate.name === name);
    if (layer?.type !== "tilelayer") throw new Error(`Expected ${name} tile layer`);
    return layer;
}
