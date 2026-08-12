import {
    createCenteredMap,
    createWaterUnderlayLayer,
    getTileLayerGid,
    WamFile,
    type WAMFileFormat,
} from "@workadventure/map-editor";
import type { ModifyTerrainMessage } from "@workadventure/messages";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fileSystemMock = vi.hoisted(() => ({
    readFileAsString: vi.fn(),
    writeStringAsFile: vi.fn(),
}));

vi.mock("../../fileSystem", () => ({ fileSystem: fileSystemMock }));
vi.mock("../PathMapper", () => ({
    mapPathUsingDomainWithPrefix: (filePath: string) => filePath.replace(/^\//, ""),
}));

import { persistTerrainMutation } from "../TerrainPersistenceService";

function createFiniteSource(): ITiledMap {
    return {
        compressionlevel: -1,
        orientation: "orthogonal",
        infinite: false,
        width: 1,
        height: 1,
        tilewidth: 32,
        tileheight: 32,
        layers: [
            {
                id: 1,
                name: "floor",
                type: "tilelayer",
                width: 1,
                height: 1,
                data: [1],
                opacity: 1,
                visible: true,
                x: 0,
                y: 0,
            },
        ],
        tilesets: [
            {
                firstgid: 1,
                name: "terrain",
                image: "terrain.png",
                imagewidth: 320,
                imageheight: 32,
                tilewidth: 32,
                tileheight: 32,
                tilecount: 10,
                columns: 10,
                margin: 0,
                spacing: 0,
            },
        ],
        nextlayerid: 2,
        nextobjectid: 1,
        renderorder: "right-down",
        tiledversion: "1.10.2",
        type: "map",
        version: "1.10",
    };
}

const sourceMap = JSON.stringify(createCenteredMap(createFiniteSource()));
const wam: WAMFileFormat = {
    version: "1.0.0",
    mapUrl: "map.tmj",
    entities: {},
    areas: [],
    entityCollections: [],
};

function message(regions: ModifyTerrainMessage["regions"]): ModifyTerrainMessage {
    return {
        mapUrl: "http://maps.example.test/maps/map.tmj",
        regions,
        tilesetJson: "",
        removeTileset: false,
        layerJson: "",
        removeLayer: false,
        beforeLayer: "",
        elevationUpdates: [],
    };
}

function floorLayer(map: ITiledMap) {
    const layer = map.layers[0];
    if (layer?.type !== "tilelayer") throw new Error("Expected floor tile layer");
    return layer;
}

describe("persistTerrainMutation", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        fileSystemMock.readFileAsString.mockResolvedValue(sourceMap);
        fileSystemMock.writeStringAsFile.mockResolvedValue(undefined);
    });

    it("persists signed edits without moving previously stored coordinates", async () => {
        await persistTerrainMutation(
            new WamFile(wam),
            new URL("http://maps.example.test/maps/map.wam"),
            message([{ layer: "floor", x: -3, y: -2, width: 1, height: 1, gids: [8] }]),
        );

        const firstPersisted = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[0][1] as string) as ITiledMap;
        expect(getTileLayerGid(floorLayer(firstPersisted), -3, -2)).toBe(8);
        expect(getTileLayerGid(floorLayer(firstPersisted), 0, 0)).toBe(1);

        fileSystemMock.readFileAsString.mockResolvedValue(JSON.stringify(firstPersisted));
        await persistTerrainMutation(
            new WamFile(wam),
            new URL("http://maps.example.test/maps/map.wam"),
            message([{ layer: "floor", x: 4, y: 3, width: 1, height: 1, gids: [7] }]),
        );

        const secondPersisted = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[1][1] as string) as ITiledMap;
        expect(getTileLayerGid(floorLayer(secondPersisted), -3, -2)).toBe(8);
        expect(getTileLayerGid(floorLayer(secondPersisted), 0, 0)).toBe(1);
        expect(getTileLayerGid(floorLayer(secondPersisted), 4, 3)).toBe(7);
        expect(secondPersisted.properties).toEqual(firstPersisted.properties);
    });

    it("persists sparse elevation independently of floor tiles", async () => {
        await persistTerrainMutation(new WamFile(wam), new URL("http://maps.example.test/maps/map.wam"), {
            ...message([]),
            elevationUpdates: [{ layer: "floor", x: -3, y: -2, elevation: 2 }],
        });

        const persisted = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[0][1] as string) as ITiledMap;
        expect(getTileLayerGid(floorLayer(persisted), 0, 0)).toBe(1);
        expect(persisted.properties).toContainEqual({
            name: "teapot:elevation/v1",
            type: "string",
            value: '{"version":1,"cells":[{"layer":"floor","x":-3,"y":-2,"elevation":2}]}',
        });
    });

    it("persists an atomic water underlay and surface cutout", async () => {
        const map = JSON.parse(sourceMap) as ITiledMap;
        const underlay = createWaterUnderlayLayer(map, "floor");
        await persistTerrainMutation(new WamFile(wam), new URL("http://maps.example.test/maps/map.wam"), {
            ...message([
                { layer: "floor", x: 0, y: 0, width: 1, height: 1, gids: [0] },
                { layer: underlay.name, x: 0, y: 0, width: 1, height: 1, gids: [8] },
            ]),
            layerJson: JSON.stringify(underlay),
            beforeLayer: "floor",
        });

        const persisted = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[0][1] as string) as ITiledMap;
        const persistedUnderlay = persisted.layers[0];
        expect(persistedUnderlay?.name).toBe(underlay.name);
        expect(persisted.layers[1]?.name).toBe("floor");
        expect(persistedUnderlay?.type === "tilelayer" ? getTileLayerGid(persistedUnderlay, 0, 0) : 0).toBe(8);
        const persistedFloor = persisted.layers[1];
        expect(persistedFloor?.type === "tilelayer" ? getTileLayerGid(persistedFloor, 0, 0) : -1).toBe(0);
    });

    it("rejects edits targeting a different TMJ", async () => {
        await expect(
            persistTerrainMutation(new WamFile(wam), new URL("http://maps.example.test/maps/map.wam"), {
                ...message([{ layer: "floor", x: 0, y: 0, width: 1, height: 1, gids: [8] }]),
                mapUrl: "http://maps.example.test/maps/other.tmj",
            }),
        ).rejects.toThrow("different map");
        expect(fileSystemMock.writeStringAsFile).not.toHaveBeenCalled();
    });

    it("persists a legacy finite source without rebasing it", async () => {
        fileSystemMock.readFileAsString.mockResolvedValue(JSON.stringify(createFiniteSource()));

        await persistTerrainMutation(
            new WamFile(wam),
            new URL("http://maps.example.test/maps/map.wam"),
            message([{ layer: "floor", x: 0, y: 0, width: 1, height: 1, gids: [8] }]),
        );

        const persisted = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[0][1] as string) as ITiledMap;
        expect(getTileLayerGid(floorLayer(persisted), 0, 0)).toBe(8);
        expect(persisted.infinite).toBe(false);
        expect(persisted.width).toBe(1);
        expect(persisted.height).toBe(1);
    });
});
