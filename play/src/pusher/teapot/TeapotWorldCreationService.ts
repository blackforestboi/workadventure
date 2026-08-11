import { randomUUID } from "node:crypto";

import { ITiledMap } from "@workadventure/tiled-map-type-guard";

import {
    FRONT_URL,
    INTERNAL_MAP_STORAGE_URL,
    PUBLIC_MAP_STORAGE_URL,
    TEAPOT_MAP_STORAGE_WRITE_TOKEN,
} from "../enums/EnvironmentVariable";
import { getTeapotDataServices } from "./TeapotDataRuntime";

const WORLD_SIZE = 9;
const WORLD_ORIGIN = -Math.floor(WORLD_SIZE / 2);
const GROUND_GID = 1;
const ENTRY_GID = 2;
const EXIT_GID = 3;

// A compact dirt tile derived from the repository's attributed LPC terrain assets.
const DIRT_TILE_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAAXNSR0IArs4c6QAAACBjSFJNAAB6JgAAgIQAAPoAAACA6AAAdTAAAOpgAAA6mAAAF3CculE8AAAAeGVYSUZN" +
    "TQAqAAAACAAEARoABQAAAAEAAAA+ARsABQAAAAEAAABGASgAAwAAAAEAAgAAh2kABAAAAAEAAABOAAAAAAAAAEgAAAABAAAASAAAAAEAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAIKADAAQAAAABAAAAIAAAAACfCVbEAAAACXBIWXMAAAsTAAALEwEAmpwYAAACh0lEQVRYCa2XS24UQRBEy9bIQngDCx/AW27DqbgSt+EAXpiNLcQC0KvWa0fnZPeMJUqy8xcRmVVdZck33799/TsO1v2n24PqGC8//4w9DDXWUf02i/g1PupuA21iu1zW8el1MpmNzSGylxejvaah2LSnSrwUJ/k9w3VYtNYTqI0l1LwDWDfWku84XQ7O5g6kSOcf5axhu+HI1TzxvOJZSD9F9S/VxaVNjr727I3Vo6pxCu/5cmxiDD594nkHarLGAK9dcm2OJWdeHWJqm1cgSRC2I5K/BtvxybnQXl9BJwiQfA4hLnMKps26HOqZJ17vQC1QdCmgJZ++cc2Zx7oqZh0AAEN0gxzlEEzRPd8BsImZnyATe0NA3Buk8sGywGdtyW5/nyqgxl3TrUQ/mBj5qWsOzHoJJVQLMQkKZS451sklJv3Ez2eYJIsdIXHpd1h0wOzV7NP+IbJYLWLZmHptkJhaq3rE7SfIJlWkxohUfIcB163NM0QoxSDUOEXei0+u/maAayfvGiuIPRo6cfibAUgwRA6SPvX/vW5fn3+3mnWQBF0aqqvvncq8hA7x8fNd9pl+ElNY37pxFbBOHh9c9tu8AguKPDx+0J0Wgacfvza51+clfHpZ/r14uL/Z1Me4W++EQ7JRevEzByDRTQfBHVSyDe123nipLJs6P1mHmJfQndtMUSyNbZ55Gu41RZyfbtHD3VNfXwFHW483BRzOYa05SJ4IGPAOIUcN82jMTyA5dwRJIEROQSGba8F9eVzuh1rj7K7wzWWMAY5+cwAbSza2oURJbzJj5EVlkIexPOuqJafmN6+ggoy1DOapONzRZ4NnQzWwbhB/HaADAnBJsrH5zl7SSs4/AqyTzQy2ktkAAAAASUVORK5CYII=";

// The WorkAdventure ENTRY and EXIT tiles, cropped into a two-column tileset.
const ENTRY_EXIT_TILESET_BASE64 =
    "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";

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface TeapotWorldCreationResult {
    roomUrl: string;
    wamUrl: string;
    mapUrl: string;
}

interface TeapotWorldCreationOptions {
    publicMapStorageUrl?: string;
    internalMapStorageUrl?: string;
    frontUrl?: string;
    writeToken?: string;
    fetcher?: Fetcher;
    createId?: () => string;
    grantOwner?: (actorId: string, mapUrl: string) => Promise<void>;
}

export class TeapotWorldCreationService {
    private readonly publicMapStorageUrl: string;
    private readonly internalMapStorageUrl: string;
    private readonly frontUrl: string;
    private readonly writeToken: string;
    private readonly fetcher: Fetcher;
    private readonly createId: () => string;
    private readonly grantOwner: (actorId: string, mapUrl: string) => Promise<void>;

    public constructor(options: TeapotWorldCreationOptions = {}) {
        this.publicMapStorageUrl = options.publicMapStorageUrl ?? PUBLIC_MAP_STORAGE_URL;
        this.internalMapStorageUrl = options.internalMapStorageUrl ?? INTERNAL_MAP_STORAGE_URL ?? "";
        this.frontUrl = options.frontUrl ?? FRONT_URL;
        this.writeToken = options.writeToken ?? TEAPOT_MAP_STORAGE_WRITE_TOKEN ?? "";
        this.fetcher = options.fetcher ?? fetch;
        this.createId = options.createId ?? randomUUID;
        this.grantOwner =
            options.grantOwner ??
            (async (actorId, mapUrl) => {
                await getTeapotDataServices().repository.replaceRoomAccessPolicy({
                    mapId: mapUrl,
                    role: "admin",
                    mode: "specific",
                    expectedVersion: null,
                    memberIds: [actorId],
                    actorId,
                });
            });
    }

    public async create(input: { actorId: string; sourceRoomUrl?: string }): Promise<TeapotWorldCreationResult> {
        this.assertConfigured();
        const worldId = this.createId();
        const directory = `worlds/${worldId}`;
        const paths = {
            wam: `${directory}/maps/world.wam`,
            map: `${directory}/maps/world.tmj`,
        };
        const publicBase = appendPath(this.publicMapStorageUrl, "");
        const mapUrl = appendPath(publicBase.toString(), paths.map).toString();
        const wamUrl = appendPath(publicBase.toString(), paths.wam).toString();
        const roomUrl = new URL(`/~/${paths.wam}`, this.frontUrl || publicBase.origin).toString();
        const template = createBlankInfiniteWorldTemplate(input.sourceRoomUrl, this.frontUrl || publicBase.origin);
        const archive = createStoredZip([
            { name: "assets/dirt.png", content: Buffer.from(DIRT_TILE_BASE64, "base64") },
            { name: "assets/entry-exit.png", content: Buffer.from(ENTRY_EXIT_TILESET_BASE64, "base64") },
            { name: "maps/world.tmj", content: Buffer.from(JSON.stringify(template.map)) },
            { name: "maps/world.wam", content: Buffer.from(JSON.stringify(template.wam)) },
        ]);

        const uploadUrl = appendPath(this.internalMapStorageUrl, "upload");
        const form = new FormData();
        const archiveBytes = new Uint8Array(archive.length);
        archiveBytes.set(archive);
        form.append("directory", directory);
        form.append("file", new Blob([archiveBytes], { type: "application/zip" }), `${worldId}.zip`);

        const response = await this.storageFetch(uploadUrl, publicBase.host, { method: "POST", body: form });
        if (!response.ok) {
            throw new TeapotWorldCreationError(`Map storage rejected the new world (${response.status})`, 502);
        }

        try {
            await this.grantOwner(input.actorId, mapUrl);
        } catch (error: unknown) {
            await this.storageFetch(appendPath(this.internalMapStorageUrl, directory), publicBase.host, {
                method: "DELETE",
            }).catch(() => undefined);
            throw error;
        }

        return { roomUrl, wamUrl, mapUrl };
    }

    private assertConfigured(): void {
        if (!this.publicMapStorageUrl || !this.internalMapStorageUrl || !this.frontUrl || !this.writeToken) {
            throw new TeapotWorldCreationError("World creation is not configured", 503);
        }
    }

    private storageFetch(url: URL, host: string, init: RequestInit): Promise<Response> {
        const headers = new Headers(init.headers);
        headers.set("Authorization", `Bearer ${this.writeToken}`);
        headers.set("X-Forwarded-Host", host);
        return this.fetcher(url, { ...init, headers, cache: "no-store" });
    }
}

export function createBlankInfiniteWorldTemplate(sourceRoomUrl: string | undefined, playUrl: string) {
    const ground = Array.from({ length: WORLD_SIZE * WORLD_SIZE }, () => GROUND_GID);
    const entry = Array.from({ length: WORLD_SIZE * WORLD_SIZE }, () => 0);
    const exit = Array.from({ length: WORLD_SIZE * WORLD_SIZE }, () => 0);
    entry[Math.floor(WORLD_SIZE / 2) * WORLD_SIZE + 2] = ENTRY_GID;
    exit[Math.floor(WORLD_SIZE / 2) * WORLD_SIZE + WORLD_SIZE - 3] = EXIT_GID;

    const layer = (id: number, name: string, data: number[], properties?: unknown[]) => ({
        id,
        name,
        type: "tilelayer" as const,
        width: WORLD_SIZE,
        height: WORLD_SIZE,
        x: 0,
        y: 0,
        startx: WORLD_ORIGIN,
        starty: WORLD_ORIGIN,
        offsetx: 0,
        offsety: 0,
        opacity: 1,
        visible: true,
        data: [],
        chunks: [{ x: WORLD_ORIGIN, y: WORLD_ORIGIN, width: WORLD_SIZE, height: WORLD_SIZE, data }],
        ...(properties === undefined ? {} : { properties }),
    });

    const map = ITiledMap.parse({
        compressionlevel: -1,
        height: WORLD_SIZE,
        width: WORLD_SIZE,
        infinite: true,
        nextlayerid: 5,
        nextobjectid: 1,
        orientation: "orthogonal",
        renderorder: "right-down",
        tiledversion: "1.9.2",
        tileheight: 32,
        tilewidth: 32,
        type: "map",
        version: "1.9",
        properties: [
            { name: "workadventure:coordinateSystem", type: "string", value: "centered-v1" },
            { name: "workadventure:chunkOriginX", type: "int", value: WORLD_ORIGIN },
            { name: "workadventure:chunkOriginY", type: "int", value: WORLD_ORIGIN },
            { name: "workadventure:tileOffsetX", type: "float", value: 0 },
            { name: "workadventure:tileOffsetY", type: "float", value: 0 },
        ],
        layers: [
            layer(1, "ground", ground),
            layer(2, "start", entry),
            layer(
                3,
                "exit",
                exit,
                sourceRoomUrl === undefined ? undefined : [{ name: "exitUrl", type: "string", value: sourceRoomUrl }],
            ),
            {
                id: 4,
                name: "floorLayer",
                type: "objectgroup",
                draworder: "topdown",
                opacity: 1,
                visible: true,
                x: 0,
                y: 0,
                objects: [],
            },
        ],
        tilesets: [
            {
                firstgid: GROUND_GID,
                name: "Basic dirt",
                image: "../assets/dirt.png",
                imagewidth: 32,
                imageheight: 32,
                tilewidth: 32,
                tileheight: 32,
                tilecount: 1,
                columns: 1,
                margin: 0,
                spacing: 0,
                properties: [
                    {
                        name: "tilesetCopyright",
                        type: "string",
                        value: "Liberated Pixel Cup terrain assets (CC BY-SA 3.0 / GPL 3.0)",
                    },
                ],
            },
            {
                firstgid: ENTRY_GID,
                name: "Entry and exit",
                image: "../assets/entry-exit.png",
                imagewidth: 64,
                imageheight: 32,
                tilewidth: 32,
                tileheight: 32,
                tilecount: 2,
                columns: 2,
                margin: 0,
                spacing: 0,
                tiles: [{ id: 0, properties: [{ name: "start", type: "bool", value: true }] }],
            },
        ],
    });

    const playBase = new URL(playUrl);
    const wam = {
        version: "1.0.0",
        mapUrl: "./world.tmj",
        entities: {},
        areas: [],
        entityCollections: [
            { url: new URL("/collections/FurnitureCollection.json", playBase).toString(), type: "file" },
            { url: new URL("/collections/OfficeCollection.json", playBase).toString(), type: "file" },
        ],
        lastCommandId: randomUUID(),
    };

    return { map, wam };
}

export class TeapotWorldCreationError extends Error {
    public constructor(
        message: string,
        readonly statusCode: number,
    ) {
        super(message);
        this.name = "TeapotWorldCreationError";
    }
}

function appendPath(base: string, path: string): URL {
    const url = new URL(base);
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
    url.search = "";
    url.hash = "";
    return url;
}

interface ZipEntry {
    name: string;
    content: Buffer;
}

/** Creates an uncompressed ZIP archive without introducing a runtime archive dependency. */
export function createStoredZip(entries: ZipEntry[]): Buffer {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let localOffset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name);
        const checksum = crc32(entry.content);
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(entry.content.length, 18);
        localHeader.writeUInt32LE(entry.content.length, 22);
        localHeader.writeUInt16LE(name.length, 26);
        localParts.push(localHeader, name, entry.content);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(entry.content.length, 20);
        centralHeader.writeUInt32LE(entry.content.length, 24);
        centralHeader.writeUInt16LE(name.length, 28);
        centralHeader.writeUInt32LE(localOffset, 42);
        centralParts.push(centralHeader, name);
        localOffset += localHeader.length + name.length + entry.content.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(localOffset, 16);
    return Buffer.concat([...localParts, centralDirectory, end]);
}

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export const teapotWorldCreationService = new TeapotWorldCreationService();
