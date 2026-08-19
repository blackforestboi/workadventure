import { describe, expect, it } from "vitest";

import cameraManagerSource from "../../../../../src/front/Phaser/Game/CameraManager.ts?raw";
import gameMapFrontWrapperSource from "../../../../../src/front/Phaser/Game/GameMap/GameMapFrontWrapper.ts?raw";
import gameSceneSource from "../../../../../src/front/Phaser/Game/GameScene.ts?raw";

describe("viewport streaming runtime integration", () => {
    it("refreshes the cached plan from camera events and resize instead of the scene update loop", () => {
        const updateMethod = gameSceneSource.slice(
            gameSceneSource.indexOf("public update(time: number, delta: number): void"),
            gameSceneSource.indexOf("private addConversationBubblesAffectedByPlayerMove"),
        );

        expect(cameraManagerSource).toMatch(
            /private onCameraUpdate = \(\) => \{\s*this\.refreshViewportStreamingPlan\(\);\s*this\.scene\.sendViewportToServer\(\);/,
        );
        expect(gameSceneSource).toMatch(
            /public onResize\(\): void \{\s*super\.onResize\(\);\s*this\.cameraManager\?\.onViewportResize\(\);/,
        );
        expect(updateMethod).not.toContain("refreshViewportStreamingPlan(");
    });

    it("passes map tile dimensions into camera policy and exposes the cached plan", () => {
        expect(gameSceneSource).toMatch(
            /new CameraManager\(\s*this,\s*mapBounds,\s*this\.gameMapFrontWrapper\.getTileDimensions\(\),\s*waScaleManager,/,
        );
        expect(gameSceneSource).toMatch(
            /public getViewportStreamingPlan\(\): ViewportStreamingPlan \{\s*return this\.cameraManager\.getViewportStreamingPlan\(\);/,
        );
    });

    it("caps server viewport calculations to the full-detail resident rectangle", () => {
        expect(gameSceneSource).toContain("getFullDetailResidentPixelViewport(");
        expect(gameSceneSource).toMatch(
            /const residentViewport = getFullDetailResidentPixelViewport\([\s\S]*?return this\.intersectViewportWithMapBounds\(viewport,/,
        );
        expect(gameSceneSource).toMatch(
            /camera\.preRender\(\);\s*this\.cameraManager\.refreshViewportStreamingPlan\(\);/,
        );
    });

    it("creates and advances a sparse resident tilemap while retaining canonical world state", () => {
        expect(gameSceneSource).toContain("shouldUseResidentTileWindow(this.mapFile)");
        expect(gameSceneSource).toContain("projectTiledMapToTileBounds(this.mapFile, residentTileBounds)");
        expect(gameSceneSource).toMatch(/this\.add\.tilemap\([\s\S]*?cacheKey,[\s\S]*?true,[\s\S]*?\)/);
        expect(gameSceneSource).toContain("this.cache.tilemap.remove(cacheKey)");
        expect(gameSceneSource).toContain("new GameMap(this.mapFile, this.wamFile, { residentTileBounds })");
        expect(gameSceneSource).toContain("recenterResidentTileWindow(startPosition, true)");
    });

    it("keeps pathfinding and elevation aligned with the resident window", () => {
        expect(gameSceneSource).toContain("this.gameMapFrontWrapper.getCollisionGridBounds()");
        expect(gameSceneSource).toContain(
            "this.elevationRenderer.render(this.mapFile, this.gameMapFrontWrapper.getResidentTileBounds())",
        );
        expect(gameSceneSource).toContain("recenterResidentTileWindowAtWorldPosition");
        expect(gameMapFrontWrapperSource).toContain("this.gameMap.setResidentTileBounds(next)");
        expect(gameMapFrontWrapperSource).toContain("this.repopulateResidentLayers()");
        expect(gameMapFrontWrapperSource).toContain("Array<Tile | null>(bounds.width).fill(null)");
        expect(gameMapFrontWrapperSource).toContain("const map = this.getRuntimeGridMap()");
        expect(gameMapFrontWrapperSource).toContain("this.gameMap.getTileInSourceLayerByKey(key, layer.name)");
    });
});
