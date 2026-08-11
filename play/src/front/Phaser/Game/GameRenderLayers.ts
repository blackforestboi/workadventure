import * as Phaser from "phaser";
import { DEPTH_OVERLAY_INDEX, DEPTH_TILE_INDEX } from "./DepthIndexes";

const DEPTH_WORLD_INDEX = DEPTH_TILE_INDEX + 1;
const BACKGROUND_OBJECT_LOCAL_DEPTH = DEPTH_OVERLAY_INDEX;

export type MapRenderBand = "background" | "foreground";
export type DepthGameObject = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth;

/**
 * Keeps map tiles, Y-sorted world objects, and intentional foreground tiles in
 * separate display lists. World coordinates are only compared inside the world
 * layer, so a negative centered-map Y coordinate can never fall behind a floor.
 */
export class GameRenderLayers {
    public readonly background: Phaser.GameObjects.Layer;
    public readonly world: Phaser.GameObjects.Layer;
    public readonly foreground: Phaser.GameObjects.Layer;

    constructor(scene: Phaser.Scene) {
        this.background = scene.add.layer().setName("map-background").setDepth(DEPTH_TILE_INDEX);
        this.world = scene.add.layer().setName("map-world").setDepth(DEPTH_WORLD_INDEX);
        this.foreground = scene.add.layer().setName("map-foreground").setDepth(DEPTH_OVERLAY_INDEX);
    }

    public addMapLayer<T extends DepthGameObject>(
        gameObject: T,
        band: MapRenderBand,
        localDepth: number,
    ): T {
        gameObject.setDepth(localDepth);
        this.getMapBand(band).add(gameObject);
        return gameObject;
    }

    public addBackgroundObject<T extends DepthGameObject>(gameObject: T): T {
        gameObject.setDepth(BACKGROUND_OBJECT_LOCAL_DEPTH);
        this.background.add(gameObject);
        return gameObject;
    }

    public addWorldObject<T extends DepthGameObject>(gameObject: T): T {
        this.world.add(gameObject);
        return gameObject;
    }

    public addToSameMapBand<T extends DepthGameObject>(
        reference: DepthGameObject,
        gameObject: T,
        localDepth = reference.depth,
    ): boolean {
        if (reference.displayList === this.background) {
            this.addMapLayer(gameObject, "background", localDepth);
            return true;
        }
        if (reference.displayList === this.foreground) {
            this.addMapLayer(gameObject, "foreground", localDepth);
            return true;
        }
        return false;
    }

    private getMapBand(band: MapRenderBand): Phaser.GameObjects.Layer {
        return band === "background" ? this.background : this.foreground;
    }
}
