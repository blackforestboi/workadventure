import type {
    ITiledMap,
    ITiledMapLayer,
    ITiledMapObject,
    ITiledMapProperty,
    ITiledMapTileLayer,
    Json,
} from "@workadventure/tiled-map-type-guard";
import { upgradeMapToNewest } from "@workadventure/tiled-map-type-guard";
import type { WAMFileFormat } from "../types";
import { GameMapProperties } from "../types";
import {
    getMapWorldBounds,
    getMapTileBounds,
    getTileLayerGid,
    isCenteredMap,
    materializeTileLayerData,
    setCenteredTileLayerGid,
    tileToLayerIndex,
    worldToMapIndex,
} from "./CenteredMapCoordinates";
import type { TileBounds, WorldBounds } from "./CenteredMapCoordinates";
import { projectTiledMapToTileBounds } from "./ChunkDomain";
import type { ChunkTileBounds } from "./ChunkDomain";
import { flattenGroupLayersMap } from "./LayersFlattener";
import { WamFile } from "./WamFile";

export interface GameMapOptions {
    /**
     * Restricts dense runtime tile-layer data to this global tile-coordinate window. The canonical map returned by
     * getMap() remains complete and getMapBounds() continues to describe the complete source map.
     */
    residentTileBounds?: ChunkTileBounds;
}

/**
 * A wrapper around a ITiledMap interface to provide additional capabilities.
 */
export class GameMap {
    private readonly map: ITiledMap;
    private runtimeMap: ITiledMap;
    private sourceFlatLayers?: ITiledMapLayer[];
    private sourceTileBounds: TileBounds;
    private readonly wamFile?: WamFile;
    private residentTileBounds?: ChunkTileBounds;
    private tileNameMap = new Map<string, number>();

    private tileSetPropertyMap: { [tile_index: number]: Array<ITiledMapProperty> } = {};
    public readonly flatLayers: ITiledMapLayer[];
    public readonly tiledObjects: ITiledMapObject[];

    private readonly DEFAULT_TILE_SIZE = 32;

    public exitUrls: Array<string> = [];

    public hasStartTile = false;

    public constructor(map: ITiledMap, wam?: WAMFileFormat, options: GameMapOptions = {}) {
        this.map = upgradeMapToNewest(map);
        this.wamFile = wam ? new WamFile(wam) : undefined;
        this.residentTileBounds = cloneTileBounds(options.residentTileBounds);
        this.runtimeMap = createRuntimeMap(this.map, this.residentTileBounds);
        this.sourceFlatLayers = this.residentTileBounds === undefined ? undefined : flattenGroupLayersMap(this.map);
        this.sourceTileBounds = getMapTileBounds(this.map);
        this.flatLayers = materializeFlatLayers(this.runtimeMap);
        this.tiledObjects = GameMap.getObjectsFromLayers(this.flatLayers);

        for (const tileset of this.map.tilesets) {
            if ("tiles" in tileset) {
                for (const tile of tileset.tiles ?? []) {
                    if (tile.properties && tileset.firstgid !== undefined) {
                        this.tileSetPropertyMap[tileset.firstgid + tile.id] = tile.properties;
                        for (const prop of tile.properties) {
                            if (
                                prop.name == GameMapProperties.NAME &&
                                typeof prop.value == "string" &&
                                tileset.firstgid !== undefined
                            ) {
                                this.tileNameMap.set(prop.value, tileset.firstgid + tile.id);
                            }
                            if (prop.name == GameMapProperties.EXIT_URL && typeof prop.value == "string") {
                                this.exitUrls.push(prop.value);
                            } else if (prop.name == GameMapProperties.START) {
                                this.hasStartTile = true;
                            }
                        }
                    }
                }
            }
        }
    }

    public getPropertiesForIndex(index: number): Array<ITiledMapProperty> {
        if (this.tileSetPropertyMap[index]) {
            return this.tileSetPropertyMap[index];
        }
        return [];
    }

    public getTileDimensions(): { width: number; height: number } {
        return {
            width: this.map.tilewidth ?? this.DEFAULT_TILE_SIZE,
            height: this.map.tileheight ?? this.DEFAULT_TILE_SIZE,
        };
    }

    public getTileIndexAt(x: number, y: number): { x: number; y: number } {
        return worldToMapIndex(this.map, x, y);
    }

    public getMapBounds(): WorldBounds {
        return getMapWorldBounds(this.map);
    }

    public getMap(): ITiledMap {
        return this.map;
    }

    /** Returns the already-projected map used by runtime systems and flat-layer materialization. */
    public getRuntimeMap(): ITiledMap {
        return this.runtimeMap;
    }

    public getResidentTileBounds(): ChunkTileBounds | undefined {
        return cloneTileBounds(this.residentTileBounds);
    }

    /** Replaces the dense runtime tile window without changing or rebasing the canonical source map. */
    public setResidentTileBounds(bounds: ChunkTileBounds): void {
        const nextBounds = { ...bounds };
        const nextRuntimeMap = createRuntimeMap(this.map, nextBounds);
        const nextFlatLayers = materializeFlatLayers(nextRuntimeMap);
        this.residentTileBounds = nextBounds;
        this.runtimeMap = nextRuntimeMap;
        this.sourceFlatLayers ??= flattenGroupLayersMap(this.map);
        this.replaceFlatLayers(nextFlatLayers);
    }

    public synchronizeTileLayers(source: ITiledMap): void {
        this.map.infinite = source.infinite;
        this.map.width = source.width;
        this.map.height = source.height;
        this.map.properties = structuredClone(source.properties);
        this.map.layers = structuredClone(source.layers);
        this.runtimeMap = createRuntimeMap(this.map, this.residentTileBounds);
        this.sourceFlatLayers = this.residentTileBounds === undefined ? undefined : flattenGroupLayersMap(this.map);
        this.sourceTileBounds = getMapTileBounds(this.map);
        this.replaceFlatLayers(materializeFlatLayers(this.runtimeMap));
    }

    public getWamFile(): WamFile | undefined {
        return this.wamFile;
    }

    public findLayer(layerName: string): ITiledMapLayer | undefined {
        return this.flatLayers.find((layer) => layer.name === layerName);
    }

    public findObject(objectName: string, objectClass?: string): ITiledMapObject | undefined {
        const object = this.getObjectWithName(objectName);
        return !objectClass ? object : objectClass === object?.class ? object : undefined;
    }

    public getIndexForTileType(tile: string | number): number | undefined {
        if (typeof tile == "number") {
            return tile;
        }
        return this.tileNameMap.get(tile);
    }

    public setTiledObjectProperty(
        holder: { properties?: ITiledMapProperty[] },
        propertyName: string,
        propertyValue: string | number | undefined | boolean,
    ): void {
        if (holder.properties === undefined) {
            holder.properties = [];
        }
        const property = holder.properties.find((property) => property.name === propertyName);
        if (property === undefined) {
            if (propertyValue === undefined) {
                return;
            }
            if (typeof propertyValue === "string") {
                holder.properties.push({ name: propertyName, type: "string", value: propertyValue });
            } else if (typeof propertyValue === "number") {
                holder.properties.push({ name: propertyName, type: "float", value: propertyValue });
            } else {
                holder.properties.push({ name: propertyName, type: "bool", value: propertyValue });
            }
            return;
        }
        if (propertyValue === undefined) {
            const index = holder.properties.indexOf(property);
            holder.properties.splice(index, 1);
        }
        property.value = propertyValue;
    }

    public getTiledObjectProperty(
        object: { properties?: ITiledMapProperty[] },
        propertyName: string,
    ): Json | undefined {
        const properties: ITiledMapProperty[] | undefined = object.properties;
        if (!properties) {
            return undefined;
        }
        const obj = properties.find(
            (property: ITiledMapProperty) => property.name.toLowerCase() === propertyName.toLowerCase(),
        );
        if (obj === undefined) {
            return undefined;
        }
        return obj.value;
    }

    public getObjectWithName(name: string): ITiledMapObject | undefined {
        return this.tiledObjects.find((object) => object.name === name);
    }

    public getTileProperty(index: number): Array<ITiledMapProperty> {
        if (this.tileSetPropertyMap[index]) {
            return this.tileSetPropertyMap[index];
        }
        return [];
    }

    /** Looks up a canonical source tile using global tile coordinates, independently of the resident window. */
    public getTileInSourceLayer(x: number, y: number, layer: string): number | undefined {
        const sourceLayer = this.findSourceTileLayer(layer);
        return sourceLayer === undefined ? undefined : getTileLayerGid(sourceLayer, x, y);
    }

    /** Looks up a canonical source tile from a key encoded against the full canonical map dimensions. */
    public getTileInSourceLayerByKey(key: number, layer: string): number | undefined {
        const tile = this.getSourceTileCoordinatesForKey(key);
        return tile === undefined ? undefined : this.getTileInSourceLayer(tile.x, tile.y, layer);
    }

    /**
     * Updates a canonical source tile using global tile coordinates and mirrors the change into the resident window
     * when the tile is currently materialized.
     */
    public putTileInSourceLayer(index: number, x: number, y: number, layer: string): boolean {
        const sourceLayer = this.findSourceTileLayer(layer);
        if (sourceLayer === undefined) {
            console.error("The source tile layer '" + layer + "' that you want to change doesn't exist.");
            return false;
        }

        const changed = setSourceTileGid(this.map, sourceLayer, x, y, index);
        if (changed) {
            this.putGlobalTileInRuntimeLayer(index, x, y, layer);
            this.putGlobalTileInFlatLayer(index, x, y, layer);
        }
        return changed;
    }

    public putTileInFlatLayer(index: number, x: number, y: number, layer: string): void {
        const fLayer = this.findLayer(layer);
        if (fLayer == undefined) {
            console.error("The layer '" + layer + "' that you want to change doesn't exist.");
            return;
        }
        if (fLayer.type !== "tilelayer") {
            console.error(
                "The layer '" +
                    layer +
                    "' that you want to change is not a tilelayer. Tile can only be put in tilelayer.",
            );
            return;
        }
        if (typeof fLayer.data === "string") {
            console.error("Data of the layer '" + layer + "' that you want to change is only readable.");
            return;
        }
        fLayer.data[x + y * fLayer.width] = index;
    }

    public getLayersByKey(key: number): Array<ITiledMapLayer> {
        if (this.sourceFlatLayers !== undefined) {
            const tile = this.getSourceTileCoordinatesForKey(key);
            if (tile === undefined) return [];
            return this.sourceFlatLayers.filter(
                (flatLayer) => flatLayer.type === "tilelayer" && getTileLayerGid(flatLayer, tile.x, tile.y) !== 0,
            );
        }
        return this.flatLayers.filter((flatLayer) => flatLayer.type === "tilelayer" && flatLayer.data[key] !== 0);
    }

    private static getObjectsFromLayers(layers: ITiledMapLayer[]): ITiledMapObject[] {
        const objects: ITiledMapObject[] = [];

        const objectLayers = layers.filter((layer) => layer.type === "objectgroup");
        for (const objectLayer of objectLayers) {
            if (objectLayer.type === "objectgroup") {
                objects.push(...objectLayer.objects);
            }
        }

        return objects;
    }

    public getMapPropertyByKey(key: string): ITiledMapProperty | undefined {
        return this.map.properties?.find((property) => property.name === key);
    }

    public getDefaultTileSize(): number {
        return this.DEFAULT_TILE_SIZE;
    }

    // NOTE: Flat layers are deep copied so we cannot operate on them
    public deleteGameObjectFromMapById(id: number, layers: ITiledMapLayer[]): boolean {
        for (const layer of layers) {
            if (layer.type === "objectgroup") {
                const index = layer.objects.findIndex((object) => object.id === id);
                if (index !== -1) {
                    layer.objects.splice(index, 1);
                    return true;
                }
            } else if (layer.type === "group") {
                return this.deleteGameObjectFromMapById(id, layer.layers);
            }
        }
        return false;
    }

    public incrementNextObjectId(): void {
        if (this.map.nextobjectid !== undefined) {
            this.map.nextobjectid++;
        }
    }

    private replaceFlatLayers(layers: ITiledMapLayer[]): void {
        this.flatLayers.splice(0, this.flatLayers.length, ...layers);
    }

    private findSourceTileLayer(layerName: string): ITiledMapTileLayer | undefined {
        const layer = findSourceLayer(this.map.layers, layerName);
        return layer?.type === "tilelayer" ? layer : undefined;
    }

    private getSourceTileCoordinatesForKey(key: number): { x: number; y: number } | undefined {
        const width = this.map.width ?? 0;
        const height = this.map.height ?? 0;
        if (!Number.isSafeInteger(key) || key < 0 || width <= 0 || key >= width * height) return undefined;
        const y = Math.floor(key / width);
        const x = key - y * width;
        return { x: this.sourceTileBounds.minX + x, y: this.sourceTileBounds.minY + y };
    }

    private putGlobalTileInFlatLayer(index: number, x: number, y: number, layerName: string): void {
        const layer = this.findLayer(layerName);
        if (layer?.type !== "tilelayer" || typeof layer.data === "string") return;
        const local = tileToLayerIndex(layer, x, y);
        if (local.x < 0 || local.y < 0 || local.x >= layer.width || local.y >= layer.height) return;
        layer.data[local.y * layer.width + local.x] = index;
    }

    private putGlobalTileInRuntimeLayer(index: number, x: number, y: number, layerName: string): void {
        if (this.runtimeMap === this.map) return;
        const layer = findSourceLayer(this.runtimeMap.layers, layerName);
        if (layer?.type !== "tilelayer") return;
        const local = tileToLayerIndex(layer, x, y);
        if (local.x < 0 || local.y < 0 || local.x >= layer.width || local.y >= layer.height) return;
        setUnalignedTileLayerGid(layer, x, y, index);
    }
}

function createRuntimeMap(map: ITiledMap, residentTileBounds?: ChunkTileBounds): ITiledMap {
    return residentTileBounds === undefined ? map : projectTiledMapToTileBounds(map, residentTileBounds);
}

function materializeFlatLayers(map: ITiledMap): ITiledMapLayer[] {
    return flattenGroupLayersMap(map).map((layer) =>
        layer.type === "tilelayer" ? { ...layer, data: materializeTileLayerData(layer) } : layer,
    );
}

function cloneTileBounds(bounds: ChunkTileBounds | undefined): ChunkTileBounds | undefined {
    return bounds === undefined ? undefined : { ...bounds };
}

function findSourceLayer(
    layers: readonly ITiledMapLayer[],
    layerName: string,
    prefix = "",
): ITiledMapLayer | undefined {
    for (const layer of layers) {
        const qualifiedName = prefix + layer.name;
        if (layer.type === "group") {
            const child = findSourceLayer(layer.layers, layerName, qualifiedName + "/");
            if (child !== undefined) return child;
        } else if (qualifiedName === layerName) {
            return layer;
        }
    }
    return undefined;
}

function setSourceTileGid(
    map: ITiledMap,
    layer: ITiledMapTileLayer,
    tileX: number,
    tileY: number,
    gid: number,
): boolean {
    if (isCenteredMap(map) && map.infinite === true && layer.chunks !== undefined) {
        return setCenteredTileLayerGid(map, layer, tileX, tileY, gid);
    }
    return setUnalignedTileLayerGid(layer, tileX, tileY, gid);
}

function setUnalignedTileLayerGid(layer: ITiledMapTileLayer, tileX: number, tileY: number, gid: number): boolean {
    if (layer.chunks !== undefined) {
        const chunk = layer.chunks.find(
            (candidate) =>
                tileX >= candidate.x &&
                tileY >= candidate.y &&
                tileX < candidate.x + candidate.width &&
                tileY < candidate.y + candidate.height,
        );
        if (chunk === undefined) {
            if (gid === 0) return false;
            layer.chunks.push({ x: tileX, y: tileY, width: 1, height: 1, data: [gid] });
            layer.chunks.sort((left, right) => left.y - right.y || left.x - right.x);
            return true;
        }
        if (!Array.isArray(chunk.data)) throw new Error(`Tile layer ${layer.name} uses an unsupported encoded chunk`);
        const chunkIndex = (tileY - chunk.y) * chunk.width + tileX - chunk.x;
        if (chunk.data[chunkIndex] === gid) return false;
        chunk.data[chunkIndex] = gid;
        return true;
    }
    if (!Array.isArray(layer.data)) throw new Error(`Tile layer ${layer.name} uses unsupported encoded tile data`);
    const local = tileToLayerIndex(layer, tileX, tileY);
    if (local.x < 0 || local.y < 0 || local.x >= layer.width || local.y >= layer.height) return false;
    const index = local.y * layer.width + local.x;
    if (layer.data[index] === gid) return false;
    layer.data[index] = gid;
    return true;
}
