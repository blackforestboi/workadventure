import { describe, expect, it, vi } from "vitest";
import type * as Phaser from "phaser";
import { DEPTH_OVERLAY_INDEX, DEPTH_TILE_INDEX } from "../../../../src/front/Phaser/Game/DepthIndexes";
import { GameRenderLayers } from "../../../../src/front/Phaser/Game/GameRenderLayers";

type FakeGameObject = Phaser.GameObjects.GameObject & {
    depth: number;
    displayList: FakeLayer | null;
    setDepth: (depth: number) => FakeGameObject;
};

class FakeLayer {
    public depth = 0;
    public name = "";
    public list: FakeGameObject[] = [];

    public setName(name: string): this {
        this.name = name;
        return this;
    }

    public setDepth(depth: number): this {
        this.depth = depth;
        return this;
    }

    public add(gameObject: FakeGameObject): FakeGameObject {
        gameObject.displayList?.remove(gameObject);
        gameObject.displayList = this;
        this.list.push(gameObject);
        return gameObject;
    }

    public remove(gameObject: FakeGameObject): void {
        this.list = this.list.filter((candidate) => candidate !== gameObject);
        gameObject.displayList = null;
    }

    public sortedChildren(): FakeGameObject[] {
        return [...this.list].sort((left, right) => left.depth - right.depth);
    }
}

function createGameObject(depth = 0): FakeGameObject {
    const gameObject = {
        depth,
        displayList: null,
        setDepth(nextDepth: number) {
            this.depth = nextDepth;
            return this;
        },
    };
    return gameObject as FakeGameObject;
}

function createRenderLayers(): GameRenderLayers {
    const layers: FakeLayer[] = [];
    const scene = {
        add: {
            layer: vi.fn(() => {
                const layer = new FakeLayer();
                layers.push(layer);
                return layer;
            }),
        },
    };
    return new GameRenderLayers(scene as unknown as Phaser.Scene);
}

describe("GameRenderLayers", () => {
    it("keeps negative-Y world objects structurally between map tile bands", () => {
        const renderLayers = createRenderLayers();
        const backgroundTile = createGameObject();
        const actor = createGameObject(-1_000_000);
        const foregroundTile = createGameObject();

        renderLayers.addMapLayer(backgroundTile, "background", 0);
        renderLayers.addWorldObject(actor);
        renderLayers.addMapLayer(foregroundTile, "foreground", 0);

        expect(backgroundTile.displayList).toBe(renderLayers.background);
        expect(actor.displayList).toBe(renderLayers.world);
        expect(foregroundTile.displayList).toBe(renderLayers.foreground);
        expect(renderLayers.background.depth).toBe(DEPTH_TILE_INDEX);
        expect(renderLayers.world.depth).toBe(DEPTH_TILE_INDEX + 1);
        expect(renderLayers.foreground.depth).toBe(DEPTH_OVERLAY_INDEX);
    });

    it("sorts world objects by their local feet depth across zero", () => {
        const renderLayers = createRenderLayers();
        const upperActor = createGameObject(-32);
        const lowerActor = createGameObject(48);

        renderLayers.addWorldObject(lowerActor);
        renderLayers.addWorldObject(upperActor);

        expect((renderLayers.world as unknown as FakeLayer).sortedChildren()).toEqual([upperActor, lowerActor]);

        upperActor.setDepth(64);
        expect((renderLayers.world as unknown as FakeLayer).sortedChildren()).toEqual([lowerActor, upperActor]);
    });

    it("places editor fallback images directly after their source tile in the same band", () => {
        const renderLayers = createRenderLayers();
        const sourceBackgroundTile = createGameObject();
        const sourceForegroundTile = createGameObject();
        const backgroundFallback = createGameObject();
        const foregroundFallback = createGameObject();

        renderLayers.addMapLayer(sourceBackgroundTile, "background", 3);
        renderLayers.addMapLayer(sourceForegroundTile, "foreground", 5);

        expect(renderLayers.addToSameMapBand(sourceBackgroundTile, backgroundFallback, 3.01)).toBe(true);
        expect(renderLayers.addToSameMapBand(sourceForegroundTile, foregroundFallback, 5.01)).toBe(true);
        expect(backgroundFallback.displayList).toBe(renderLayers.background);
        expect(backgroundFallback.depth).toBe(3.01);
        expect(foregroundFallback.displayList).toBe(renderLayers.foreground);
        expect(foregroundFallback.depth).toBe(5.01);
    });

    it("removes a replaced tile without affecting world objects", () => {
        const renderLayers = createRenderLayers();
        const tile = createGameObject();
        const actor = createGameObject(-500);

        renderLayers.addMapLayer(tile, "background", 0);
        renderLayers.addWorldObject(actor);
        (renderLayers.background as unknown as FakeLayer).remove(tile);

        expect(tile.displayList).toBeNull();
        expect(actor.displayList).toBe(renderLayers.world);
        expect((renderLayers.world as unknown as FakeLayer).list).toContain(actor);
    });
});
