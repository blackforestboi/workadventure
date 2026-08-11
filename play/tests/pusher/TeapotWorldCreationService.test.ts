// @vitest-environment node

import { isCenteredMap } from "@workadventure/map-editor";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/pusher/enums/EnvironmentVariable", () => ({
    FRONT_URL: "https://play.example.test/",
    INTERNAL_MAP_STORAGE_URL: "http://map-storage.internal:3000",
    PUBLIC_MAP_STORAGE_URL: "https://play.example.test/map-storage",
    TEAPOT_MAP_STORAGE_WRITE_TOKEN: "storage-secret",
}));
vi.mock("../../src/pusher/teapot/TeapotDataRuntime", () => ({ getTeapotDataServices: vi.fn() }));

import {
    createBlankInfiniteWorldTemplate,
    TeapotWorldCreationService,
} from "../../src/pusher/teapot/TeapotWorldCreationService";

describe("TeapotWorldCreationService", () => {
    it("builds a centered infinite dirt canvas with visible entry and exit tiles", () => {
        const sourceRoomUrl = "https://play.example.test/~/maps/source.wam";
        const { map, wam } = createBlankInfiniteWorldTemplate(sourceRoomUrl, "https://play.example.test/");
        const tileLayers = map.layers.filter((layer) => layer.type === "tilelayer");
        const layerByName = new Map(tileLayers.map((layer) => [layer.name, layer]));

        expect(map.infinite).toBe(true);
        expect(isCenteredMap(map)).toBe(true);
        expect(layerByName.get("ground")?.chunks?.[0]?.data).toEqual(Array(81).fill(1));
        const startData = layerByName.get("start")?.chunks?.[0]?.data;
        const exitData = layerByName.get("exit")?.chunks?.[0]?.data;
        expect(Array.isArray(startData) ? startData.filter(Boolean) : []).toEqual([2]);
        expect(Array.isArray(exitData) ? exitData.filter(Boolean) : []).toEqual([3]);
        expect(layerByName.get("exit")?.properties).toContainEqual({
            name: "exitUrl",
            type: "string",
            value: sourceRoomUrl,
        });
        expect(map.tilesets[1]).toMatchObject({
            name: "Entry and exit",
            tilecount: 2,
            tiles: [{ id: 0, properties: [{ name: "start", type: "bool", value: true }] }],
        });
        expect(wam).toMatchObject({
            mapUrl: "./world.tmj",
            entities: {},
            areas: [],
            entityCollections: [
                { url: "https://play.example.test/collections/FurnitureCollection.json", type: "file" },
                { url: "https://play.example.test/collections/OfficeCollection.json", type: "file" },
            ],
        });
    });

    it("uploads one validated room archive and grants the creator admin access", async () => {
        const fetcher = vi.fn((_input: string | URL, _init?: RequestInit) => Promise.resolve(new Response("ok")));
        const grantOwner = vi.fn(() => Promise.resolve());
        const service = new TeapotWorldCreationService({
            publicMapStorageUrl: "https://play.example.test/map-storage",
            internalMapStorageUrl: "http://map-storage.internal:3000",
            frontUrl: "https://play.example.test/",
            writeToken: "storage-secret",
            fetcher,
            createId: () => "world-1",
            grantOwner,
        });

        await expect(
            service.create({ actorId: "user-1", sourceRoomUrl: "https://play.example.test/~/maps/source.wam" }),
        ).resolves.toEqual({
            roomUrl: "https://play.example.test/~/worlds/world-1/maps/world.wam",
            wamUrl: "https://play.example.test/map-storage/worlds/world-1/maps/world.wam",
            mapUrl: "https://play.example.test/map-storage/worlds/world-1/maps/world.tmj",
        });

        expect(fetcher).toHaveBeenCalledTimes(1);
        const [url, init] = fetcher.mock.calls[0];
        expect(url.toString()).toBe("http://map-storage.internal:3000/upload");
        expect(init).toMatchObject({ method: "POST", cache: "no-store" });
        const headers = new Headers(init?.headers);
        expect(headers.get("Authorization")).toBe("Bearer storage-secret");
        expect(headers.get("X-Forwarded-Host")).toBe("play.example.test");
        const form = init?.body as FormData;
        expect(form.get("directory")).toBe("worlds/world-1");
        const archive = form.get("file") as Blob;
        const bytes = Buffer.from(await archive.arrayBuffer());
        expect(bytes.readUInt32LE(0)).toBe(0x04034b50);
        expect(bytes.toString("latin1")).toContain("maps/world.tmj");
        expect(bytes.toString("latin1")).toContain("maps/world.wam");
        expect(grantOwner).toHaveBeenCalledWith(
            "user-1",
            "https://play.example.test/map-storage/worlds/world-1/maps/world.tmj",
        );
    });

    it("does not grant access when map storage rejects the archive", async () => {
        const grantOwner = vi.fn(() => Promise.resolve());
        const service = new TeapotWorldCreationService({
            publicMapStorageUrl: "https://play.example.test/map-storage",
            internalMapStorageUrl: "http://map-storage.internal:3000",
            frontUrl: "https://play.example.test/",
            writeToken: "storage-secret",
            fetcher: () => Promise.resolve(new Response("invalid", { status: 400 })),
            createId: () => "world-2",
            grantOwner,
        });

        await expect(service.create({ actorId: "user-1" })).rejects.toThrow("Map storage rejected the new world");
        expect(grantOwner).not.toHaveBeenCalled();
    });
});
