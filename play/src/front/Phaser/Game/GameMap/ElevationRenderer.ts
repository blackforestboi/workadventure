import {
    createElevationSampler,
    ELEVATION_MESH_SUBDIVISIONS,
    ELEVATION_WORLD_LAYER,
    getElevationCells,
    getElevationRenderChunks,
    getElevationRenderChunksForUpdates,
    getElevationSurfaceMesh,
    getTileGridOffset,
    tileToWorldTopLeft,
    type ChunkTileBounds,
    type ElevationSampler,
    type ElevationSurfaceBounds,
    type ElevationSurfaceVertex,
    type TeapotElevationUpdate,
    worldToElevatedTileCoordinates,
} from "@workadventure/map-editor";
import type { ITiledMap } from "@workadventure/tiled-map-type-guard";
import * as Phaser from "phaser";

import type { GameScene } from "../GameScene";

type ElevationCompositeSource =
    | Phaser.Tilemaps.TilemapLayer
    | Phaser.Tilemaps.TilemapGPULayer
    | Phaser.GameObjects.Image;

interface RenderedElevationSurface {
    mesh: Phaser.GameObjects.Mesh2D;
    capture: Phaser.GameObjects.RenderTexture;
    bounds: ElevationSurfaceBounds;
}

export const ELEVATION_COMPOSITE_LAYER_DATA_KEY = "teapot:elevationCompositeLayer";
const MAXIMUM_CAPTURE_TEXTURE_SIZE = 2048;

/**
 * Warps the complete visible floor composite through one map-wide height field and applies
 * that same field to world objects. It is scene-owned so elevation is not an editor overlay.
 */
export class ElevationRenderer {
    private readonly surfaces: RenderedElevationSurface[] = [];
    private readonly hiddenSources = new Set<ElevationCompositeSource>();
    private map: ITiledMap | undefined;
    private residentTileBounds: ChunkTileBounds | undefined;
    private sampleElevation: ElevationSampler = () => 0;

    public constructor(private readonly scene: GameScene) {}

    public getTileCoordinatesAtWorldPoint(worldX: number, worldY: number): { x: number; y: number } | undefined {
        if (this.map === undefined) return undefined;
        return worldToElevatedTileCoordinates(this.map, worldX, worldY, this.sampleElevation);
    }

    public render(map: ITiledMap | undefined, residentTileBounds?: ChunkTileBounds): void {
        this.clearSurfaces();
        this.map = map;
        this.residentTileBounds = cloneTileBounds(residentTileBounds);
        this.sampleElevation = map === undefined ? () => 0 : createElevationSampler(map);
        const renderer = this.scene.game.renderer;
        if (map === undefined || !(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
            this.updateWorldObjects();
            return;
        }

        const tileHeight = map.tileheight ?? 32;
        const stepHeight = tileHeight / 2;
        const compositeSources = this.getCompositeSources();
        if (compositeSources.length === 0) {
            this.updateWorldObjects();
            return;
        }

        const referenceSource = compositeSources[compositeSources.length - 1];
        try {
            for (const bounds of getElevationRenderChunks(
                map,
                Math.min(renderer.getMaxTextureSize(), MAXIMUM_CAPTURE_TEXTURE_SIZE),
                ELEVATION_MESH_SUBDIVISIONS,
                this.residentTileBounds,
            )) {
                const surface = getElevationSurfaceMesh(
                    map,
                    ELEVATION_WORLD_LAYER,
                    ELEVATION_MESH_SUBDIVISIONS,
                    bounds,
                );
                if (surface.vertices.length === 0 || surface.indices.length === 0) continue;
                const topLeft = tileToWorldTopLeft(map, bounds.minX, bounds.minY);
                const bottomRight = tileToWorldTopLeft(map, bounds.maxX, bounds.maxY);
                const capture = this.scene.make.renderTexture(
                    {
                        x: 0,
                        y: 0,
                        width: Math.max(1, Math.ceil(bottomRight.x - topLeft.x)),
                        height: Math.max(1, Math.ceil(bottomRight.y - topLeft.y)),
                    },
                    false,
                );
                let mesh: Phaser.GameObjects.Mesh2D | undefined;
                try {
                    capture.draw(compositeSources, -topLeft.x, -topLeft.y).render();
                    const vertices = getMeshVertices(map, surface.vertices, stepHeight);
                    const indices = surface.indices.flatMap((index, position) =>
                        position % 3 === 2 ? [index, 0] : [index],
                    );
                    mesh = this.scene.add
                        .mesh2d(0, 0, capture.texture, vertices, indices, true)
                        .setRenderAsTriangles(true)
                        .setScrollFactor(referenceSource.scrollFactorX, referenceSource.scrollFactorY);
                    this.scene
                        .getGameRenderLayers()
                        .addToSameMapBand(referenceSource, mesh, referenceSource.depth + 0.5);
                    this.surfaces.push({ mesh, capture, bounds });
                } catch (error) {
                    mesh?.destroy();
                    capture.destroy();
                    throw error;
                }
            }
        } catch (error) {
            this.clearSurfaces();
            throw error;
        }
        if (this.surfaces.length === 0) {
            this.updateWorldObjects();
            return;
        }
        for (const source of compositeSources) {
            source.setVisible(false);
            this.hiddenSources.add(source);
        }
        this.updateWorldObjects();
        this.scene.markDirty();
    }

    /** Updates only meshes touched by a sculpt while preserving their captures and unchanged map chunks. */
    public renderElevationUpdates(
        map: ITiledMap,
        updates: readonly TeapotElevationUpdate[],
        residentTileBounds = this.residentTileBounds,
    ): void {
        const renderer = this.scene.game.renderer;
        const nextResidentTileBounds = cloneTileBounds(residentTileBounds);
        if (!tileBoundsEqual(this.residentTileBounds, nextResidentTileBounds)) {
            this.render(map, nextResidentTileBounds);
            return;
        }
        if (
            this.surfaces.length === 0 ||
            !(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) ||
            getElevationCells(map).length === 0
        ) {
            this.render(map, nextResidentTileBounds);
            return;
        }

        this.map = map;
        this.sampleElevation = createElevationSampler(map);
        const affectedBounds = new Set(
            getElevationRenderChunksForUpdates(
                map,
                Math.min(renderer.getMaxTextureSize(), MAXIMUM_CAPTURE_TEXTURE_SIZE),
                updates,
                ELEVATION_MESH_SUBDIVISIONS,
                nextResidentTileBounds,
            ).map(boundsKey),
        );
        const stepHeight = (map.tileheight ?? 32) / 2;
        for (const rendered of this.surfaces) {
            if (!affectedBounds.has(boundsKey(rendered.bounds))) continue;
            const surface = getElevationSurfaceMesh(
                map,
                ELEVATION_WORLD_LAYER,
                ELEVATION_MESH_SUBDIVISIONS,
                rendered.bounds,
            );
            rendered.mesh.vertices = getMeshVertices(map, surface.vertices, stepHeight);
        }
        this.updateWorldObjects();
        this.scene.markDirty();
    }

    public updateWorldObjects(): void {
        const map = this.map;
        if (map === undefined) return;

        this.scene.CurrentPlayer?.setElevationOffset(
            this.getWorldOffset(this.scene.CurrentPlayer.x, this.scene.CurrentPlayer.y),
        );
        for (const player of this.scene.MapPlayersByKey.values()) {
            player.setElevationOffset(this.getWorldOffset(player.x, player.y));
        }
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            entity.setElevationOffset(
                this.getWorldOffset(entity.x + entity.displayWidth / 2, entity.y + entity.displayHeight),
            );
        }
    }

    public destroy(): void {
        this.clearSurfaces();
        this.scene.CurrentPlayer?.setElevationOffset(0);
        for (const player of this.scene.MapPlayersByKey.values()) player.setElevationOffset(0);
        for (const entity of this.scene.getGameMapFrontWrapper().getEntitiesManager().getEntities().values()) {
            entity.setElevationOffset(0);
        }
        this.map = undefined;
        this.residentTileBounds = undefined;
        this.sampleElevation = () => 0;
    }

    private getWorldOffset(worldX: number, worldY: number): number {
        const map = this.map;
        if (map === undefined) return 0;
        const offset = getTileGridOffset(map);
        const tileX = (worldX - offset.x) / (map.tilewidth ?? 32);
        const tileY = (worldY - offset.y) / (map.tileheight ?? 32);
        return this.sampleElevation(tileX, tileY) * ((map.tileheight ?? 32) / 2);
    }

    /** Collects the visible background floor stack in the same order Phaser renders it. */
    private getCompositeSources(): ElevationCompositeSource[] {
        const background = this.scene.getGameRenderLayers().background;
        const tileSources = this.scene
            .getGameMapFrontWrapper()
            .phaserLayers.filter((source) => source.visible && source.displayList === background);
        const overlaySources = background.list.filter(
            (candidate): candidate is Phaser.GameObjects.Image =>
                candidate instanceof Phaser.GameObjects.Image &&
                candidate.visible &&
                typeof candidate.getData(ELEVATION_COMPOSITE_LAYER_DATA_KEY) === "string",
        );
        return [...tileSources, ...overlaySources].sort((left, right) => left.depth - right.depth);
    }

    private clearSurfaces(): void {
        for (const surface of this.surfaces) {
            surface.mesh.destroy();
            surface.capture.destroy();
        }
        this.surfaces.length = 0;
        for (const source of this.hiddenSources) {
            if (source.active) source.setVisible(true);
        }
        this.hiddenSources.clear();
    }
}

function boundsKey(bounds: ElevationSurfaceBounds): string {
    return `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`;
}

function cloneTileBounds(bounds: ChunkTileBounds | undefined): ChunkTileBounds | undefined {
    return bounds === undefined ? undefined : { ...bounds };
}

function tileBoundsEqual(left: ChunkTileBounds | undefined, right: ChunkTileBounds | undefined): boolean {
    if (left === undefined || right === undefined) return left === right;
    return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function getMeshVertices(map: ITiledMap, vertices: readonly ElevationSurfaceVertex[], stepHeight: number): number[] {
    return vertices.flatMap((vertex) => {
        const world = tileToWorldTopLeft(map, vertex.x, vertex.y);
        return [world.x, world.y - vertex.elevation * stepHeight, vertex.u, vertex.v];
    });
}
