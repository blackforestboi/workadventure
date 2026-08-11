import { GameMapProperties } from "@workadventure/map-editor";
import type { ITiledMapProperty } from "@workadventure/tiled-map-type-guard";

export interface MutablePhaserTile {
    properties: Record<string, unknown>;
    resetCollision(): unknown;
    setCollision(left?: boolean, right?: boolean, up?: boolean, down?: boolean): unknown;
}

/** Phaser reuses Tile objects when their index changes, so replace properties and collision state explicitly. */
export function replacePhaserTileProperties(tile: MutablePhaserTile, properties: readonly ITiledMapProperty[]): void {
    tile.properties = Object.fromEntries(properties.map((property) => [property.name, property.value]));
    tile.resetCollision();
    if (tile.properties[GameMapProperties.COLLIDES]) {
        tile.setCollision(true);
    }
}
