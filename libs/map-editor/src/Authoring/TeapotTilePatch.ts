import type { ITiledMap, ITiledMapLayer } from "@workadventure/tiled-map-type-guard";
import { z } from "zod";
import {
    isCenteredMap,
    setCenteredTileLayerGid,
    synchronizeCenteredMapBounds,
} from "../GameMap/CenteredMapCoordinates";

const MIN_SIGNED_TILE_COORDINATE = -2_147_483_648;
const MAX_SIGNED_TILE_COORDINATE = 2_147_483_647;

export const TeapotTileRegion = z
    .object({
        layer: z.string().trim().min(1).max(200),
        x: z.number().int().min(MIN_SIGNED_TILE_COORDINATE).max(MAX_SIGNED_TILE_COORDINATE),
        y: z.number().int().min(MIN_SIGNED_TILE_COORDINATE).max(MAX_SIGNED_TILE_COORDINATE),
        width: z.number().int().positive().max(256),
        height: z.number().int().positive().max(256),
        gids: z.array(z.number().int().nonnegative().max(0xffff_ffff)).max(256 * 256),
    })
    .superRefine((region, context) => {
        if (region.gids.length !== region.width * region.height) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["gids"],
                message: `Expected ${region.width * region.height} tile GIDs, received ${region.gids.length}`,
            });
        }
        if (region.x + region.width - 1 > MAX_SIGNED_TILE_COORDINATE) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["width"], message: "Tile region exceeds int32 X" });
        }
        if (region.y + region.height - 1 > MAX_SIGNED_TILE_COORDINATE) {
            context.addIssue({ code: z.ZodIssueCode.custom, path: ["height"], message: "Tile region exceeds int32 Y" });
        }
    });

export type TeapotTileRegion = z.infer<typeof TeapotTileRegion>;

export const TeapotTilePatch = z.object({
    mapId: z.string().trim().min(1).max(2_048),
    expectedRevision: z.number().int().nonnegative(),
    regions: z.array(TeapotTileRegion).min(1).max(128),
});

export type TeapotTilePatch = z.infer<typeof TeapotTilePatch>;

export interface TeapotAppliedTilePatch {
    map: ITiledMap;
    changedTiles: number;
    affectedBounds: { x: number; y: number; width: number; height: number };
}

export interface TeapotEmbeddedTilesetInput {
    name: string;
    image: string;
    imageWidth: number;
    imageHeight: number;
    tileWidth?: number;
    tileHeight?: number;
}

export interface TeapotEmbeddedTilesetResult {
    map: ITiledMap;
    firstGid: number;
    tileCount: number;
}

export class TeapotTilePatchError extends Error {
    constructor(
        message: string,
        readonly code: "unsupported-map" | "unknown-layer" | "invalid-layer" | "out-of-bounds" | "invalid-gid",
    ) {
        super(message);
        this.name = "TeapotTilePatchError";
    }
}

/** Applies the browser editor's small deterministic TMJ profile while preserving unknown fields. */
export function applyTeapotTilePatch(source: ITiledMap, input: TeapotTilePatch): TeapotAppliedTilePatch {
    assertSupportedMap(source);
    const map = structuredClone(source);
    const centered = map.infinite === true && isCenteredMap(map);
    const layers = flattenLayers(map.layers);
    let changedTiles = 0;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const region of input.regions) {
        const layer = layers.find((candidate) => candidate.name === region.layer);
        if (layer === undefined) {
            throw new TeapotTilePatchError(`Tile layer ${region.layer} does not exist`, "unknown-layer");
        }
        if (layer.type !== "tilelayer") {
            throw new TeapotTilePatchError(`Layer ${region.layer} is not a tile layer`, "invalid-layer");
        }
        if (centered && layer.chunks === undefined) {
            throw new TeapotTilePatchError(`Layer ${region.layer} is not an infinite tile layer`, "invalid-layer");
        }
        if (!centered && !Array.isArray(layer.data)) {
            throw new TeapotTilePatchError(`Layer ${region.layer} is not a finite tile layer`, "invalid-layer");
        }
        const layerStartX = layer.startx ?? 0;
        const layerStartY = layer.starty ?? 0;
        if (
            !centered &&
            (region.x < layerStartX ||
                region.y < layerStartY ||
                region.x + region.width > layerStartX + layer.width ||
                region.y + region.height > layerStartY + layer.height)
        ) {
            throw new TeapotTilePatchError(`Region exceeds the bounds of layer ${region.layer}`, "out-of-bounds");
        }
        for (let localY = 0; localY < region.height; localY += 1) {
            for (let localX = 0; localX < region.width; localX += 1) {
                const gid = region.gids[localY * region.width + localX];
                if (gid === undefined || !isKnownGid(map, gid)) {
                    throw new TeapotTilePatchError(`Tile GID ${String(gid)} is not defined by this map`, "invalid-gid");
                }
                if (centered) {
                    if (setCenteredTileLayerGid(map, layer, region.x + localX, region.y + localY, gid)) {
                        changedTiles += 1;
                    }
                } else {
                    const data = layer.data;
                    if (!Array.isArray(data)) throw new Error("Finite tile layer data disappeared during editing");
                    const offset = (region.y + localY - layerStartY) * layer.width + region.x + localX - layerStartX;
                    if (data[offset] !== gid) {
                        data[offset] = gid;
                        changedTiles += 1;
                    }
                }
            }
        }

        minX = Math.min(minX, region.x);
        minY = Math.min(minY, region.y);
        maxX = Math.max(maxX, region.x + region.width);
        maxY = Math.max(maxY, region.y + region.height);
    }

    if (centered) synchronizeCenteredMapBounds(map);

    return {
        map,
        changedTiles,
        affectedBounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
    };
}

/** Adds a grid-aligned, embedded single-image tileset while preserving the complete source TMJ. */
export function addTeapotEmbeddedTileset(
    source: ITiledMap,
    input: TeapotEmbeddedTilesetInput,
): TeapotEmbeddedTilesetResult {
    assertSupportedMap(source);
    const tileWidth = input.tileWidth ?? 32;
    const tileHeight = input.tileHeight ?? 32;
    if (
        tileWidth !== 32 ||
        tileHeight !== 32 ||
        input.imageWidth <= 0 ||
        input.imageHeight <= 0 ||
        input.imageWidth % tileWidth !== 0 ||
        input.imageHeight % tileHeight !== 0
    ) {
        throw new TeapotTilePatchError("Tileset image dimensions must align to the 32px tile grid", "invalid-gid");
    }
    if (input.name.trim() === "" || input.image.trim() === "") {
        throw new TeapotTilePatchError("Tileset name and image URL are required", "invalid-gid");
    }
    const map = structuredClone(source);
    const firstGid = Math.max(
        1,
        ...map.tilesets.map((tileset, index) => {
            const tileCount = "tilecount" in tileset && typeof tileset.tilecount === "number" ? tileset.tilecount : 1;
            return map.tilesets[index + 1]?.firstgid ?? (tileset.firstgid ?? 1) + tileCount;
        }),
    );
    const columns = input.imageWidth / tileWidth;
    const rows = input.imageHeight / tileHeight;
    const tileCount = columns * rows;
    map.tilesets.push({
        columns,
        firstgid: firstGid,
        image: input.image,
        imageheight: input.imageHeight,
        imagewidth: input.imageWidth,
        margin: 0,
        name: input.name.trim(),
        spacing: 0,
        tilecount: tileCount,
        tileheight: tileHeight,
        tilewidth: tileWidth,
    });
    return { map, firstGid, tileCount };
}

function assertSupportedMap(map: ITiledMap): void {
    const centered = map.infinite === true && isCenteredMap(map);
    const finite = map.infinite !== true;
    if (map.orientation !== "orthogonal" || (!finite && !centered)) {
        throw new TeapotTilePatchError(
            "Only finite or centered infinite orthogonal TMJ maps can be edited",
            "unsupported-map",
        );
    }
    const invalidChunks =
        centered &&
        flattenLayers(map.layers).some((layer) => {
            if (layer.type !== "tilelayer" || layer.chunks === undefined) return layer.type === "tilelayer";
            const origins = new Set<string>();
            return layer.chunks.some((chunk) => {
                const origin = `${chunk.x},${chunk.y}`;
                const invalid =
                    !Number.isInteger(chunk.x) ||
                    !Number.isInteger(chunk.y) ||
                    !Number.isInteger(chunk.width) ||
                    !Number.isInteger(chunk.height) ||
                    chunk.width <= 0 ||
                    chunk.height <= 0 ||
                    chunk.width > 16 ||
                    chunk.height > 16 ||
                    !Array.isArray(chunk.data) ||
                    chunk.data.length !== chunk.width * chunk.height ||
                    origins.has(origin);
                origins.add(origin);
                return invalid;
            });
        });
    if (invalidChunks) {
        throw new TeapotTilePatchError("Centered terrain chunks must use JSON tile arrays", "unsupported-map");
    }
    if (
        map.tilesets.some(
            (tileset) => "source" in tileset || !("image" in tileset) || typeof tileset.image !== "string",
        )
    ) {
        throw new TeapotTilePatchError(
            "Only embedded, single-image tilesets can be edited in the browser",
            "unsupported-map",
        );
    }
}

function flattenLayers(layers: ITiledMapLayer[]): ITiledMapLayer[] {
    const result: ITiledMapLayer[] = [];
    for (const layer of layers) {
        result.push(layer);
        if (layer.type === "group") result.push(...flattenLayers(layer.layers));
    }
    return result;
}

function isKnownGid(map: ITiledMap, gid: number): boolean {
    if (gid === 0) return true;
    const unflippedGid = gid & 0x1fffffff;
    return map.tilesets.some((tileset, index) => {
        if (typeof tileset.firstgid !== "number") return false;
        const nextFirstGid = map.tilesets[index + 1]?.firstgid ?? Number.POSITIVE_INFINITY;
        return unflippedGid >= tileset.firstgid && unflippedGid < nextFirstGid;
    });
}
