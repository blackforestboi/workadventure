import {
    createElevationSampler,
    ELEVATION_WORLD_LAYER,
    getElevationSurfaceBounds,
    getElevationSurfaceMesh,
    getTileGridOffset,
    tileToWorldTopLeft,
    type ElevationSampler,
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
}

export const ELEVATION_COMPOSITE_LAYER_DATA_KEY = "teapot:elevationCompositeLayer";

/**
 * Warps the complete visible floor composite through one map-wide height field and applies
 * that same field to world objects. It is scene-owned so elevation is not an editor overlay.
 */
export class ElevationRenderer {
    private readonly surfaces: RenderedElevationSurface[] = [];
    private map: ITiledMap | undefined;
    private sampleElevation: ElevationSampler = () => 0;

    public constructor(private readonly scene: GameScene) {}

    public render(map: ITiledMap | undefined): void {
        this.clearSurfaces();
        this.map = map;
        this.sampleElevation = map === undefined ? () => 0 : createElevationSampler(map);
        if (map === undefined || !(this.scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) {
            this.updateWorldObjects();
            return;
        }

        const tileHeight = map.tileheight ?? 32;
        const stepHeight = tileHeight / 2;
        const bounds = getElevationSurfaceBounds(map, ELEVATION_WORLD_LAYER);
        const surface = getElevationSurfaceMesh(map, ELEVATION_WORLD_LAYER, 4);
        const compositeSources = this.getCompositeSources();
        if (
            bounds === undefined ||
            surface.vertices.length === 0 ||
            surface.indices.length === 0 ||
            compositeSources.length === 0
        ) {
            this.updateWorldObjects();
            return;
        }

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
        capture.draw(compositeSources, -topLeft.x, -topLeft.y).render();

        const vertices = surface.vertices.flatMap((vertex) => {
            const world = tileToWorldTopLeft(map, vertex.x, vertex.y);
            return [world.x, world.y - vertex.elevation * stepHeight, vertex.u, vertex.v];
        });
        const indices = surface.indices.flatMap((index, position) => (position % 3 === 2 ? [index, 0] : [index]));
        const referenceSource = compositeSources[compositeSources.length - 1];
        const mesh = this.scene.add
            .mesh2d(0, 0, capture.texture, vertices, indices)
            .setRenderAsTriangles(true)
            .setScrollFactor(referenceSource.scrollFactorX, referenceSource.scrollFactorY);
        this.scene.getGameRenderLayers().addToSameMapBand(referenceSource, mesh, referenceSource.depth + 0.5);

        // The original flat stack remains visible outside the sparse height field. Inside it,
        // this one mesh replaces the complete visible floor composite with its warped version.
        this.surfaces.push({ mesh, capture });
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
    }
}
