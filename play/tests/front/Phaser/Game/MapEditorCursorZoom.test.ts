import { describe, expect, it } from "vitest";

import { getCursorZoomAnchor, getCursorZoomFocus } from "../../../../src/front/Phaser/Game/CameraZoomUtils";
import cameraManagerSource from "../../../../src/front/Phaser/Game/CameraManager.ts?raw";
import gameSceneSource from "../../../../src/front/Phaser/Game/GameScene.ts?raw";

describe("map editor cursor-centered zoom", () => {
    it("keeps the world position under an off-center cursor fixed while zooming", () => {
        const anchor = getCursorZoomAnchor({ x: 100, y: 80 }, { x: 400, y: 260 }, { x: 320, y: 240 }, 1);

        expect(anchor).toEqual({
            viewportOffset: { x: 80, y: 20 },
            worldPosition: { x: 180, y: 100 },
        });
        expect(getCursorZoomFocus(anchor, 2)).toEqual({ x: 140, y: 90 });
        expect(getCursorZoomFocus(anchor, 0.5)).toEqual({ x: 20, y: 60 });
    });

    it("does not move the focus when the cursor is centered", () => {
        const anchor = getCursorZoomAnchor({ x: 320, y: 240 }, { x: 320, y: 240 }, { x: 320, y: 240 }, 1.5);

        expect(getCursorZoomFocus(anchor, 3)).toEqual({ x: 320, y: 240 });
    });

    it("retains the cursor anchor across wheel events before another camera render", () => {
        const firstAnchor = getCursorZoomAnchor({ x: 100, y: 80 }, { x: 400, y: 260 }, { x: 320, y: 240 }, 1);
        const firstFocus = getCursorZoomFocus(firstAnchor, 2);
        const secondAnchor = getCursorZoomAnchor(firstFocus, { x: 400, y: 260 }, { x: 320, y: 240 }, 2);

        expect(secondAnchor.worldPosition).toEqual(firstAnchor.worldPosition);
        expect(getCursorZoomFocus(secondAnchor, 4)).toEqual({ x: 160, y: 95 });
    });

    it("only supplies a cursor anchor while the map editor is active", () => {
        expect(gameSceneSource).toMatch(
            /const cursorPosition = this\.mapEditorModeManager\?\.isActive\(\)[\s\S]*?\? \{ x: pointer\.x, y: pointer\.y \}[\s\S]*?this\.zoomByFactor\(zoomFactor, cursorPosition === undefined, cursorPosition\);/,
        );
        expect(cameraManagerSource).toMatch(
            /if \(duration === 0\) \{\s*this\.applyZoomModifier\(targetZoomModifier, false, cursorZoomAnchor\);[\s\S]*return;\s*\}/,
        );
        expect(cameraManagerSource).toMatch(
            /onZoomChanged = \(\): void => \{\s*if \(this\.mapEditorModeActive\) \{\s*return;\s*\}\s*this\.updateNormalCameraBounds\(\);\s*this\.doUpdateCameraOffset\(true\);/,
        );
        expect(cameraManagerSource).toMatch(
            /doUpdateCameraOffset\(instant = false\): void \{\s*if \(this\.mapEditorModeActive\) \{\s*this\.cancelOffsetTween\(\);\s*this\.camera\.setFollowOffset\(0, 0\);/,
        );
    });
});
