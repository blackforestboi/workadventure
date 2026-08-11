import { WamFile, type WAMFileFormat } from "@workadventure/map-editor";
import type { ModifyTerrainMessage } from "@workadventure/messages";
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

const sourceMap = JSON.stringify({
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
});

describe("persistTerrainMutation", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        fileSystemMock.readFileAsString.mockResolvedValue(sourceMap);
        fileSystemMock.writeStringAsFile.mockResolvedValue(undefined);
    });

    it("writes the tile change before resolving", async () => {
        const wam: WAMFileFormat = {
            version: "1.0.0",
            mapUrl: "map.tmj",
            entities: {},
            areas: [],
            entityCollections: [],
        };
        const message: ModifyTerrainMessage = {
            mapUrl: "http://maps.example.test/maps/map.tmj",
            regions: [{ layer: "floor", x: 0, y: 0, width: 1, height: 1, gids: [8] }],
            tilesetJson: "",
            removeTileset: false,
        };

        await persistTerrainMutation(new WamFile(wam), new URL("http://maps.example.test/maps/map.wam"), message);

        expect(fileSystemMock.writeStringAsFile).toHaveBeenCalledOnce();
        const persisted = JSON.parse(fileSystemMock.writeStringAsFile.mock.calls[0][1] as string) as {
            layers: { data: number[] }[];
        };
        expect(persisted.layers[0].data).toEqual([8]);
    });

    it("rejects edits targeting a different TMJ", async () => {
        const wam: WAMFileFormat = {
            version: "1.0.0",
            mapUrl: "map.tmj",
            entities: {},
            areas: [],
            entityCollections: [],
        };

        await expect(
            persistTerrainMutation(new WamFile(wam), new URL("http://maps.example.test/maps/map.wam"), {
                mapUrl: "http://maps.example.test/maps/other.tmj",
                regions: [{ layer: "floor", x: 0, y: 0, width: 1, height: 1, gids: [8] }],
                tilesetJson: "",
                removeTileset: false,
            }),
        ).rejects.toThrow("different map");
        expect(fileSystemMock.writeStringAsFile).not.toHaveBeenCalled();
    });
});
