import type { ITiledMapProperty } from "@workadventure/tiled-map-type-guard";
import { describe, expect, it, vi } from "vitest";

import {
    replacePhaserTileProperties,
    type MutablePhaserTile,
} from "../../../../../src/front/Phaser/Game/GameMap/TilePropertySync";

function property(name: string, value: string | boolean): ITiledMapProperty {
    return { name, type: typeof value === "boolean" ? "bool" : "string", value } as ITiledMapProperty;
}

function tile(properties: Record<string, unknown>) {
    return {
        properties,
        resetCollision: vi.fn(() => undefined),
        setCollision: vi.fn(() => undefined),
    } satisfies MutablePhaserTile;
}

describe("replacePhaserTileProperties", () => {
    it("removes stale collision state when a collidable tile is erased or replaced", () => {
        const target = tile({ collides: true, legacy: "old" });

        replacePhaserTileProperties(target, [property("terrain", "grass")]);

        expect(target.properties).toEqual({ terrain: "grass" });
        expect(target.resetCollision).toHaveBeenCalledOnce();
        expect(target.setCollision).not.toHaveBeenCalled();
    });

    it("applies collision state from the replacement tile", () => {
        const target = tile({});

        replacePhaserTileProperties(target, [property("collides", true)]);

        expect(target.properties).toEqual({ collides: true });
        expect(target.resetCollision).toHaveBeenCalledOnce();
        expect(target.setCollision).toHaveBeenCalledWith(true);
    });
});
