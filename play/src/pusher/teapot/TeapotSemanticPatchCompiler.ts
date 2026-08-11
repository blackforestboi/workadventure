import type { TeapotInteractionProperty, TeapotMapSummary } from "@workadventure/teapot-mcp/contracts";
import { TeapotMapPatch as TeapotMapPatchSchema } from "@workadventure/teapot-mcp/contracts";
import { addTeapotEmbeddedTileset, applyTeapotTilePatch } from "@workadventure/map-editor";
import type { ITiledMap, ITiledMapLayer, ITiledMapProperty } from "@workadventure/tiled-map-type-guard";
import {
    ITiledMap as ITiledMapSchema,
    ITiledMapObject as ITiledMapObjectSchema,
} from "@workadventure/tiled-map-type-guard";

import type { TeapotDataRepository } from "./TeapotDataRepository";

export interface TeapotCompiledMapPatch {
    map: ITiledMap;
    summary: string;
    changedTiles: number;
    changedObjects: number;
    changedAnimations: number;
    importedTilesets: TeapotImportedTilesetPreview[];
}

export interface TeapotImportedTilesetPreview {
    assetId: string;
    name: string;
    firstGid: number;
    lastGidExclusive: number;
    tileCount: number;
}

export interface TeapotResolvedTilesetImport {
    assetId: string;
    name: string;
    image: string;
    imageWidth: number;
    imageHeight: number;
}

export class TeapotSemanticPatchError extends Error {
    constructor(
        message: string,
        readonly code:
            | "invalid-patch"
            | "unknown-layer"
            | "unknown-object"
            | "unknown-tileset"
            | "invalid-gid"
            | "invalid-animation"
            | "invalid-result",
    ) {
        super(message);
        this.name = "TeapotSemanticPatchError";
    }
}

export function compileTeapotMapPatch(
    source: ITiledMap,
    uncheckedPatch: unknown,
    resolvedTilesets: ReadonlyMap<string, TeapotResolvedTilesetImport> = new Map(),
): TeapotCompiledMapPatch {
    const parsedPatch = TeapotMapPatchSchema.safeParse(uncheckedPatch);
    if (!parsedPatch.success)
        throw new TeapotSemanticPatchError("The structured map patch is invalid", "invalid-patch");
    const patch = parsedPatch.data;
    let mapWithImports = structuredClone(source);
    const importedTilesets: TeapotImportedTilesetPreview[] = [];
    for (const operation of patch.operations) {
        if (operation.kind !== "import-tileset") continue;
        const resolved = resolvedTilesets.get(operation.assetId);
        if (resolved === undefined || resolved.name !== operation.name) {
            throw new TeapotSemanticPatchError(
                `Tileset asset ${operation.assetId} was not resolved for this patch`,
                "unknown-tileset",
            );
        }
        if (
            mapWithImports.tilesets.some(
                (tileset) => ("source" in tileset ? tileset.source : tileset.name) === operation.name,
            )
        ) {
            throw new TeapotSemanticPatchError(`Tileset name ${operation.name} already exists`, "invalid-result");
        }
        const added = addTeapotEmbeddedTileset(mapWithImports, {
            name: resolved.name,
            image: resolved.image,
            imageWidth: resolved.imageWidth,
            imageHeight: resolved.imageHeight,
        });
        mapWithImports = added.map;
        importedTilesets.push({
            assetId: operation.assetId,
            name: operation.name,
            firstGid: added.firstGid,
            lastGidExclusive: added.firstGid + added.tileCount,
            tileCount: added.tileCount,
        });
    }
    const paintOperations = patch.operations.filter((operation) => operation.kind === "paint-region");
    const painted =
        paintOperations.length === 0
            ? { map: mapWithImports, changedTiles: 0 }
            : applyTeapotTilePatch(mapWithImports, {
                  mapId: patch.mapUrl,
                  expectedRevision: patch.expectedRevision,
                  regions: paintOperations.map(({ layer, x, y, width, height, gids }) => ({
                      layer,
                      x,
                      y,
                      width,
                      height,
                      gids,
                  })),
              });
    const map = painted.map;
    const layers = flattenLayers(map.layers);
    let changedObjects = 0;
    let changedAnimations = 0;

    for (const operation of patch.operations) {
        switch (operation.kind) {
            case "import-tileset":
            case "paint-region":
                break;
            case "place-tile-object":
            case "place-zone": {
                const layer = requireObjectLayer(layers, operation.layer);
                if (operation.kind === "place-tile-object" && !isKnownGid(map, operation.gid)) {
                    throw new TeapotSemanticPatchError(`Tile GID ${operation.gid} is not defined`, "invalid-gid");
                }
                const object = ITiledMapObjectSchema.parse({
                    id: nextObjectId(map),
                    name: operation.name,
                    visible: operation.visible,
                    x: operation.x,
                    y: operation.y,
                    width: operation.width,
                    height: operation.height,
                    rotation: operation.rotation,
                    ...(operation.kind === "place-tile-object"
                        ? { gid: operation.gid }
                        : { class: "area", type: "area" }),
                    properties: compileInteractionProperties(operation.properties),
                });
                layer.objects.push(object);
                map.nextobjectid = object.id + 1;
                changedObjects += 1;
                break;
            }
            case "update-object": {
                const layer = requireObjectLayer(layers, operation.layer);
                const index = layer.objects.findIndex((object) => object.id === operation.objectId);
                const current = layer.objects[index];
                if (current === undefined) {
                    throw new TeapotSemanticPatchError(
                        `Object ${operation.objectId} does not exist on layer ${operation.layer}`,
                        "unknown-object",
                    );
                }
                const updated = ITiledMapObjectSchema.parse({
                    ...current,
                    ...(operation.name === undefined ? {} : { name: operation.name }),
                    ...(operation.x === undefined ? {} : { x: operation.x }),
                    ...(operation.y === undefined ? {} : { y: operation.y }),
                    ...(operation.width === undefined ? {} : { width: operation.width }),
                    ...(operation.height === undefined ? {} : { height: operation.height }),
                    ...(operation.rotation === undefined ? {} : { rotation: operation.rotation }),
                    ...(operation.visible === undefined ? {} : { visible: operation.visible }),
                    ...(operation.properties === undefined
                        ? {}
                        : { properties: compileInteractionProperties(operation.properties) }),
                });
                layer.objects[index] = updated;
                changedObjects += 1;
                break;
            }
            case "remove-object": {
                const layer = requireObjectLayer(layers, operation.layer);
                const index = layer.objects.findIndex((object) => object.id === operation.objectId);
                if (index < 0) {
                    throw new TeapotSemanticPatchError(
                        `Object ${operation.objectId} does not exist on layer ${operation.layer}`,
                        "unknown-object",
                    );
                }
                layer.objects.splice(index, 1);
                changedObjects += 1;
                break;
            }
            case "define-tile-animation": {
                const tileset = map.tilesets.find(
                    (candidate) => !("source" in candidate) && candidate.name === operation.tileset,
                );
                if (tileset === undefined || "source" in tileset || !("image" in tileset)) {
                    throw new TeapotSemanticPatchError(
                        `Embedded tileset ${operation.tileset} does not exist`,
                        "unknown-tileset",
                    );
                }
                const tileCount = tileset.tilecount;
                if (
                    (tileCount !== undefined && operation.tileId >= tileCount) ||
                    operation.frames.some((frame) => tileCount !== undefined && frame.tileId >= tileCount)
                ) {
                    throw new TeapotSemanticPatchError(
                        `Animation references a tile outside tileset ${operation.tileset}`,
                        "invalid-animation",
                    );
                }
                const currentTiles = tileset.tiles ?? [];
                const tileIndex = currentTiles.findIndex((tile) => tile.id === operation.tileId);
                const animation = operation.frames.map((frame) => ({
                    tileid: frame.tileId,
                    duration: frame.durationMs,
                }));
                if (tileIndex < 0) {
                    currentTiles.push({ id: operation.tileId, animation });
                } else {
                    currentTiles[tileIndex] = { ...currentTiles[tileIndex], animation };
                }
                tileset.tiles = currentTiles;
                changedAnimations += 1;
                break;
            }
            default: {
                const exhaustive: never = operation;
                throw new Error(`Unhandled map operation: ${String(exhaustive)}`);
            }
        }
    }

    const verified = ITiledMapSchema.safeParse(map);
    if (!verified.success) {
        throw new TeapotSemanticPatchError("The structured patch produced an invalid TMJ map", "invalid-result");
    }
    return {
        map: verified.data,
        changedTiles: painted.changedTiles,
        changedObjects,
        changedAnimations,
        importedTilesets,
        summary: `${patch.title}: ${importedTilesets.length} tileset(s) imported${formatImportedGidRanges(importedTilesets)}, ${painted.changedTiles} tile(s), ${changedObjects} object(s), and ${changedAnimations} animation(s) changed.`,
    };
}

export async function resolveTeapotTilesetImports(
    repository: Pick<TeapotDataRepository, "getAsset">,
    ownerId: string,
    uncheckedPatch: unknown,
    publicBaseUrl: string,
): Promise<ReadonlyMap<string, TeapotResolvedTilesetImport>> {
    const parsedPatch = TeapotMapPatchSchema.safeParse(uncheckedPatch);
    if (!parsedPatch.success) {
        throw new TeapotSemanticPatchError("The structured map patch is invalid", "invalid-patch");
    }
    const imports = parsedPatch.data.operations.filter((operation) => operation.kind === "import-tileset");
    const resolved = await Promise.all(
        imports.map(async (operation): Promise<TeapotResolvedTilesetImport> => {
            const asset = await repository.getAsset(operation.assetId);
            if (
                asset === null ||
                asset.ownerId !== ownerId ||
                asset.kind !== "tileset" ||
                asset.mediaType !== "image/png" ||
                !asset.published ||
                asset.deletedAt !== null
            ) {
                throw new TeapotSemanticPatchError(
                    `Tileset asset ${operation.assetId} is unavailable for this owner`,
                    "unknown-tileset",
                );
            }
            const imageWidth = readRequiredAssetDimension(asset.metadata, "width");
            const imageHeight = readRequiredAssetDimension(asset.metadata, "height");
            if (imageWidth % 32 !== 0 || imageHeight % 32 !== 0) {
                throw new TeapotSemanticPatchError(
                    `Tileset asset ${operation.assetId} is not aligned to the 32px grid`,
                    "unknown-tileset",
                );
            }
            return {
                assetId: operation.assetId,
                name: operation.name,
                image: `${publicBaseUrl.replace(/\/+$/, "")}/teapot/tileset-assets/${operation.assetId}.png`,
                imageWidth,
                imageHeight,
            };
        }),
    );
    return new Map(resolved.map((tileset) => [tileset.assetId, tileset]));
}

export function summarizeTeapotMap(mapUrl: string, revision: number, map: ITiledMap): TeapotMapSummary {
    const layers = flattenLayers(map.layers);
    const tilesets = map.tilesets.map((tileset, index) => {
        const nextTileset = map.tilesets[index + 1];
        return {
            name: "source" in tileset ? tileset.source : tileset.name,
            firstGid: requirePositiveInteger(tileset.firstgid, `tileset ${index} firstgid`),
            lastGidExclusive:
                nextTileset === undefined
                    ? null
                    : requirePositiveInteger(nextTileset.firstgid, `tileset ${index + 1} firstgid`),
            tileCount: "source" in tileset ? null : (tileset.tilecount ?? null),
        };
    });
    return {
        mapUrl,
        revision,
        width: requirePositiveInteger(map.width, "map width"),
        height: requirePositiveInteger(map.height, "map height"),
        tileWidth: requirePositiveInteger(map.tilewidth, "map tile width"),
        tileHeight: requirePositiveInteger(map.tileheight, "map tile height"),
        tileLayers: layers
            .filter((layer) => layer.type === "tilelayer")
            .map((layer) => ({
                name: layer.name,
                width: requirePositiveInteger(layer.width, `tile layer ${layer.name} width`),
                height: requirePositiveInteger(layer.height, `tile layer ${layer.name} height`),
            })),
        objectLayers: layers
            .filter((layer) => layer.type === "objectgroup")
            .map((layer) => ({ name: layer.name, objectCount: layer.objects.length })),
        tilesets,
        objects: layers
            .filter((layer) => layer.type === "objectgroup")
            .flatMap((layer) =>
                layer.objects.map((object) => ({
                    layer: layer.name,
                    id: object.id,
                    name: object.name,
                    type: object.type ?? object.class ?? null,
                    x: object.x,
                    y: object.y,
                    width: object.width ?? null,
                    height: object.height ?? null,
                })),
            )
            .slice(0, 2_000),
    };
}

function flattenLayers(layers: ITiledMapLayer[]): ITiledMapLayer[] {
    const result: ITiledMapLayer[] = [];
    for (const layer of layers) {
        result.push(layer);
        if (layer.type === "group") result.push(...flattenLayers(layer.layers));
    }
    return result;
}

function requireObjectLayer(layers: ITiledMapLayer[], name: string) {
    const layer = layers.find((candidate) => candidate.name === name);
    if (layer === undefined || layer.type !== "objectgroup") {
        throw new TeapotSemanticPatchError(`Object layer ${name} does not exist`, "unknown-layer");
    }
    return layer;
}

function nextObjectId(map: ITiledMap): number {
    const usedIds = new Set(
        flattenLayers(map.layers)
            .filter((layer) => layer.type === "objectgroup")
            .flatMap((layer) => layer.objects.map((object) => object.id)),
    );
    let candidate = Math.max(map.nextobjectid ?? 1, 1);
    while (usedIds.has(candidate)) candidate += 1;
    return candidate;
}

function isKnownGid(map: ITiledMap, gid: number): boolean {
    const unflippedGid = gid & 0x1fffffff;
    return map.tilesets.some((tileset, index) => {
        const firstGid = tileset.firstgid;
        const nextTileset = map.tilesets[index + 1];
        const nextFirstGid = nextTileset?.firstgid;
        if (firstGid === undefined || (nextTileset !== undefined && nextFirstGid === undefined)) return false;
        return unflippedGid >= firstGid && unflippedGid < (nextFirstGid ?? Number.POSITIVE_INFINITY);
    });
}

function requirePositiveInteger(value: number | undefined, field: string): number {
    if (value === undefined || !Number.isInteger(value) || value <= 0) {
        throw new TeapotSemanticPatchError(`${field} must be a positive integer`, "invalid-result");
    }
    return value;
}

function readRequiredAssetDimension(metadata: unknown, key: "width" | "height"): number {
    if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
        throw new TeapotSemanticPatchError(`Tileset asset metadata is missing ${key}`, "unknown-tileset");
    }
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0 || value > 4_096) {
        throw new TeapotSemanticPatchError(`Tileset asset metadata has an invalid ${key}`, "unknown-tileset");
    }
    return value;
}

function formatImportedGidRanges(imports: TeapotImportedTilesetPreview[]): string {
    if (imports.length === 0) return "";
    const shown = imports
        .slice(0, 12)
        .map((item) => `${item.name} ${item.firstGid}-${item.lastGidExclusive - 1}`)
        .join(", ");
    return ` (${shown}${imports.length > 12 ? `, and ${imports.length - 12} more` : ""})`;
}

function compileInteractionProperties(properties: TeapotInteractionProperty[]): ITiledMapProperty[] {
    return properties.flatMap((property) => {
        switch (property.kind) {
            case "collision":
                return [{ name: "collides", type: "bool", value: property.enabled }];
            case "depth":
                return [{ name: "depthOffset", type: "int", value: property.offset }];
            case "open-website":
                return compactProperties([
                    { name: "openWebsite", type: "string", value: property.url },
                    { name: "openWebsiteTrigger", type: "string", value: toTrigger(property.trigger) },
                    { name: "openWebsiteTriggerMessage", type: "string", value: property.triggerMessage },
                    { name: "openWebsiteAllowApi", type: "bool", value: property.allowApi },
                    { name: "openWebsiteClosable", type: "bool", value: property.closable },
                    { name: "openWebsiteWidth", type: "int", value: property.widthPercent },
                ]);
            case "open-tab":
                return [{ name: "openTab", type: "string", value: property.url }];
            case "exit":
                return [{ name: "exitUrl", type: "string", value: property.mapUrl }];
            case "play-audio":
                return [
                    { name: "playAudio", type: "string", value: property.url },
                    { name: "audioLoop", type: "bool", value: property.loop },
                    { name: "audioVolume", type: "float", value: property.volume },
                ];
            case "silent-zone":
                return [{ name: "silent", type: "bool", value: property.enabled }];
            case "named-zone":
                return [{ name: "zone", type: "string", value: property.name }];
            case "meeting":
                return compactProperties([
                    { name: "jitsiRoom", type: "string", value: property.room },
                    { name: "jitsiTrigger", type: "string", value: toTrigger(property.trigger) },
                    { name: "jitsiTriggerMessage", type: "string", value: property.triggerMessage },
                ]);
            case "camera-zoom":
                return [{ name: "zoomMargin", type: "int", value: property.margin }];
            default: {
                const exhaustive: never = property;
                throw new Error(`Unhandled interaction property: ${String(exhaustive)}`);
            }
        }
    });
}

function compactProperties(properties: Array<ITiledMapProperty | undefined>): ITiledMapProperty[] {
    return properties.filter(
        (property): property is ITiledMapProperty => property !== undefined && property.value !== undefined,
    );
}

function toTrigger(trigger: "enter" | "action"): string {
    return trigger === "enter" ? "onenter" : "onaction";
}
