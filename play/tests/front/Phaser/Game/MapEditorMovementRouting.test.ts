import { describe, expect, it } from "vitest";

import explorerToolSource from "../../../../src/front/Phaser/Game/MapEditor/Tools/ExplorerTool.ts?raw";
import cameraManagerSource from "../../../../src/front/Phaser/Game/CameraManager.ts?raw";
import entityEditorToolSource from "../../../../src/front/Phaser/Game/MapEditor/Tools/EntityEditorTool.ts?raw";
import floorEditorToolSource from "../../../../src/front/Phaser/Game/MapEditor/Tools/FloorEditorTool.ts?raw";
import mapEditorModeManagerSource from "../../../../src/front/Phaser/Game/MapEditor/MapEditorModeManager.ts?raw";
import gameSceneSource from "../../../../src/front/Phaser/Game/GameScene.ts?raw";

describe("map editor movement routing", () => {
    it("pans the camera and stops the player while edit mode is active", () => {
        expect(gameSceneSource).toMatch(
            /if \(this\.mapEditorModeManager\?\.isActive\(\)\) \{\s*this\.CurrentPlayer\.stop\(\);\s*this\.cameraManager\.move\(movementEvents\);/,
        );
        expect(gameSceneSource).toMatch(/else \{\s*this\.CurrentPlayer\.moveUser\(delta, movementEvents\);/);
    });

    it("enters exploration mode and keeps follow-on-close disabled", () => {
        expect(gameSceneSource).toMatch(
            /if \(isOn\) \{\s*this\.CurrentPlayer\.finishFollowingPath\(true\);\s*this\.CurrentPlayer\.stop\(\);\s*this\.cameraManager\.setExplorationMode\(\);/,
        );
        expect(gameSceneSource).toContain("const FOLLOW_PLAYER_WHEN_CLOSING_MAP_EDITOR = false;");
        expect(gameSceneSource).toMatch(
            /else \{\s*if \(FOLLOW_PLAYER_WHEN_CLOSING_MAP_EDITOR\) \{\s*this\.cameraManager\.startFollowPlayer\(this\.CurrentPlayer\);\s*\}/,
        );
    });

    it("keeps the editor camera in exploration mode when leaving the explore tool", () => {
        expect(explorerToolSource).toMatch(
            /if \(!this\.mapEditorModeManager\.isActive\(\)\) \{[\s\S]*cameraManager\.startFollowPlayer\(this\.scene\.CurrentPlayer, 1000\);[\s\S]*cameraManager\.zoomByFactor\(targetZoomFactor, 1000\);[\s\S]*\}/,
        );
    });

    it("owns canvas dragging during normal gameplay and resumes player follow on movement", () => {
        expect(mapEditorModeManagerSource).toMatch(
            /if \(this\.active \|\| gameObjects\.length > 0 \|\| !pointer\.leftButtonDown\(\)\) return;[\s\S]*this\.normalPanCandidate = true;/,
        );
        expect(mapEditorModeManagerSource).toMatch(
            /if \(!hasPointerDragged\(pointer\)\) return;[\s\S]*cameraManager\.setExplorationMode\(\);[\s\S]*cameraManager\.scrollCameraByScreenDelta\(/,
        );
        expect(mapEditorModeManagerSource).toMatch(
            /this\.scene\.CurrentPlayer\.once\(hasMovedEventName, this\.resumePlayerFollowAfterNormalPan\);/,
        );
    });

    it("lets normal gameplay center every map edge with half a viewport of surrounding space", () => {
        expect(cameraManagerSource).toContain("originX - halfViewportWidth");
        expect(cameraManagerSource).toContain("originY - halfViewportHeight");
        expect(cameraManagerSource).toMatch(
            /if \(isOpened\) \{\s*this\.camera\.removeBounds\(\);\s*\} else \{\s*this\.updateNormalCameraBounds\(\);\s*\}/,
        );
        expect(cameraManagerSource).toMatch(
            /private readonly onZoomChanged = \(\): void => \{\s*if \(this\.mapEditorModeActive\) \{\s*return;\s*\}\s*this\.updateNormalCameraBounds\(\);/,
        );
    });

    it("updates the normal camera frame after terrain expands the map", () => {
        expect(cameraManagerSource).toContain("this.updateZoomOutLimit();");
        expect(cameraManagerSource).toContain("const workspaceScale = this.mapEditorModeActive ? 2 : 1;");
        expect(cameraManagerSource).toContain("this.mapSize.width * workspaceScale");
        expect(cameraManagerSource).toContain("this.mapSize.height * workspaceScale");
        expect(cameraManagerSource).toContain("const marginX = this.mapEditorModeActive ? this.mapSize.width / 2 : 0;");
        expect(cameraManagerSource).toContain("originX - marginX");
        expect(cameraManagerSource).toContain("originX + this.mapSize.width + marginX");
    });

    it("converts pointer deltas and inertia from screen pixels to world distance", () => {
        expect(cameraManagerSource).toMatch(
            /scrollCameraByScreenDelta\(x: number, y: number\): void \{\s*this\.scrollCamera\(x \/ this\.camera\.zoom, y \/ this\.camera\.zoom\);\s*\}/,
        );
        expect(cameraManagerSource).toMatch(
            /setSpeedFromScreenVelocity\(velocity: \{ x: number; y: number \}\): void \{\s*this\.setSpeed\(\{\s*x: \(-velocity\.x \* 10\) \/ this\.camera\.zoom,\s*y: \(-velocity\.y \* 10\) \/ this\.camera\.zoom,\s*\}\);\s*\}/,
        );
    });

    it("does not advertise or activate panning until the pointer is actually dragged", () => {
        expect(mapEditorModeManagerSource).toMatch(/this\.scene\.input\.setDefaultCursor\("auto"\);/);
        expect(explorerToolSource).toMatch(
            /this\.explorationPanCandidate = pointer\.leftButtonDown\(\);[\s\S]*if \(!hasPointerDragged\(pointer\)\) return;[\s\S]*this\.explorationMouseIsActive = true;/,
        );
        expect(floorEditorToolSource).toMatch(
            /if \(!hasPointerDragged\(pointer\)\) return;\s*this\.startPanning\(pointer\);/,
        );
        expect(floorEditorToolSource).toMatch(/this\.panCandidate = true;/);
        expect(entityEditorToolSource).toMatch(
            /if \(!hasPointerDragged\(pointer\)\) return;\s*this\.startPanning\(pointer\);/,
        );
        expect(entityEditorToolSource).toMatch(/this\.panCandidate = true;/);
    });

    it("interrupts inherited camera animations when edit mode takes camera ownership", () => {
        expect(cameraManagerSource).toMatch(
            /setExplorationMode\(\): void \{[\s\S]*?this\.cameraAnimation\?\.onInterrupt\(\);\s*this\.cameraAnimation = undefined;\s*this\.zoomAnimation\?\.onInterrupt\(\);\s*this\.zoomAnimation = undefined;[\s\S]*?this\.camera\.setFollowOffset\(0, 0\);/,
        );
    });

    it("pans the floor editor only after its active brush is cleared", () => {
        expect(floorEditorToolSource).toMatch(
            /if \(this\.selectedLayer === ""\) \{\s*pointer\.motionFactor = 0\.35;\s*this\.panCandidate = true;\s*return;/,
        );
        expect(floorEditorToolSource).toMatch(
            /if \(this\.selectedLayer === layer && this\.selectedGid === selectedGid && state\.toolMode === "tile"\) \{[\s\S]*this\.clearBrush\(\);/,
        );
        expect(floorEditorToolSource).toMatch(
            /if \(this\.panning \|\| \(this\.panCandidate && pointer\.leftButtonDown\(\)\)\) \{[\s\S]*\.scrollCameraByScreenDelta\(pointer\.prevPosition\.x - pointer\.x, pointer\.prevPosition\.y - pointer\.y\);/,
        );
    });

    it("keeps a selected floor brush on the paint path", () => {
        expect(floorEditorToolSource).toMatch(
            /if \(this\.saving\) return;\s*const tile = this\.getTileAtPointer\(pointer\);\s*if \(tile === undefined\) return;[\s\S]*this\.painting = true;/,
        );
    });

    it("pans the entity editor only on empty map space with no selected entity or placement preview", () => {
        expect(entityEditorToolSource).toMatch(
            /private canStartPanning\(pointer: Pointer, gameObjects: GameObject\[\], clickedAreaPreview\?: boolean\): boolean \{[\s\S]*pointer\.leftButtonDown\(\) &&[\s\S]*gameObjects\.length === 0 &&[\s\S]*this\.entityPrefabPreview === undefined &&[\s\S]*this\.entityPrefab === undefined &&[\s\S]*get\(mapEditorSelectedEntityStore\) === undefined/,
        );
        expect(entityEditorToolSource).toMatch(
            /if \(this\.panning \|\| \(this\.panCandidate && pointer\.leftButtonDown\(\)\)\) \{[\s\S]*\.scrollCameraByScreenDelta\(pointer\.prevPosition\.x - pointer\.x, pointer\.prevPosition\.y - pointer\.y\);/,
        );
    });
});
