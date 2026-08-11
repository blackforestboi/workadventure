import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getMapWorldBounds, isCenteredMap, type WAMFileFormat } from "@workadventure/map-editor";
import { ITiledMap } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it } from "vitest";

const defaultMapsDirectory = fileURLToPath(new URL("../../../tests/assets/maps/", import.meta.url));

function readDefaultWam(fileName: string): WAMFileFormat {
    return JSON.parse(fs.readFileSync(path.join(defaultMapsDirectory, fileName), "utf8")) as WAMFileFormat;
}

function readDefaultMap(mapUrl: string) {
    return ITiledMap.parse(
        JSON.parse(fs.readFileSync(path.join(defaultMapsDirectory, path.basename(mapUrl)), "utf8")) as unknown,
    );
}

describe("default maps", () => {
    it("uses centered infinite geometry for every bundled local map", () => {
        const localMapFiles = new Set(
            fs
                .readdirSync(defaultMapsDirectory)
                .filter((fileName) => fileName.endsWith(".wam"))
                .map(readDefaultWam)
                .map((wam) => wam.mapUrl)
                .filter((mapUrl) => mapUrl.startsWith("./"))
                .map((mapUrl) => path.basename(mapUrl)),
        );

        expect(localMapFiles.size).toBeGreaterThan(0);
        for (const mapFile of localMapFiles) {
            const map = readDefaultMap(mapFile);
            const tileLayers = map.layers.filter((layer) => layer.type === "tilelayer");

            expect(map.infinite, `${mapFile} should be infinite`).toBe(true);
            expect(isCenteredMap(map), `${mapFile} should use centered coordinates`).toBe(true);
            expect(tileLayers.length, `${mapFile} should contain tile layers`).toBeGreaterThan(0);
            expect(
                tileLayers.every((layer) => layer.chunks !== undefined),
                `${mapFile} should use chunked tile layers`,
            ).toBe(true);
        }
    });

    it("keeps bundled WAM areas inside their centered local maps", () => {
        const localWams = fs
            .readdirSync(defaultMapsDirectory)
            .filter((fileName) => fileName.endsWith(".wam"))
            .map(readDefaultWam)
            .filter((wam) => wam.mapUrl.startsWith("./"));

        for (const wam of localWams) {
            const map = readDefaultMap(wam.mapUrl);
            const bounds = getMapWorldBounds(map);

            for (const area of wam.areas) {
                expect(area.x + area.width, `${area.name} should extend into the map horizontally`).toBeGreaterThan(
                    bounds.x,
                );
                expect(area.x, `${area.name} should start before the map's right edge`).toBeLessThan(
                    bounds.x + bounds.width,
                );
                expect(area.y + area.height, `${area.name} should extend into the map vertically`).toBeGreaterThan(
                    bounds.y,
                );
                expect(area.y, `${area.name} should start before the map's bottom edge`).toBeLessThan(
                    bounds.y + bounds.height,
                );
            }
        }
    });
});
