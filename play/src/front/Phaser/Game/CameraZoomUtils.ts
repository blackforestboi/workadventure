// Explorer menu zoom buttons need a different feel from wheel/pinch zoom:
// clicks should animate to a clear step, while long presses should keep moving at a steady pace.
export const BUTTON_ZOOM_STEP_FACTOR = 1.2;

// A click uses a longer ease-in-out animation so the first frame does not feel like a jump.
export const SMOOTH_BUTTON_ZOOM_DURATION = 520;

// Long press keeps the previous rhythm: roughly one x1.2 zoom step every 375ms.
export const CONTINUOUS_BUTTON_ZOOM_STEP_DURATION = 375;
export const SMOOTH_BUTTON_ZOOM_TARGET_EPSILON = 0.001;
export const BUTTON_ZOOM_FACTOR_PER_SECOND = Math.pow(
    BUTTON_ZOOM_STEP_FACTOR,
    1000 / CONTINUOUS_BUTTON_ZOOM_STEP_DURATION,
);

type Point = { x: number; y: number };

export type CursorZoomAnchor = {
    worldPosition: Point;
    viewportOffset: Point;
};

/**
 * Captures the world position under the cursor from the live exploration focus.
 *
 * This deliberately avoids the Camera transform matrix. Several wheel events can arrive before Phaser renders
 * another frame, while the exploration focus has already moved. Using that live focus keeps every event on the same
 * world-space anchor instead of alternating between the previous and next rendered camera transforms.
 */
export function getCursorZoomAnchor(
    cameraFocus: Point,
    cursorPosition: Point,
    viewportCenter: Point,
    currentZoom: number,
): CursorZoomAnchor {
    const viewportOffset = {
        x: cursorPosition.x - viewportCenter.x,
        y: cursorPosition.y - viewportCenter.y,
    };

    return {
        viewportOffset,
        worldPosition: {
            x: cameraFocus.x + viewportOffset.x / currentZoom,
            y: cameraFocus.y + viewportOffset.y / currentZoom,
        },
    };
}

/**
 * Moves the camera focus so the captured world position remains under the cursor at the new zoom level.
 */
export function getCursorZoomFocus(anchor: CursorZoomAnchor, zoom: number): Point {
    return {
        x: anchor.worldPosition.x - anchor.viewportOffset.x / zoom,
        y: anchor.worldPosition.y - anchor.viewportOffset.y / zoom,
    };
}

/**
 * Retargets quick repeated clicks from the previous destination, not from the current in-flight zoom.
 * This avoids restarting from a partially animated value and makes repeated clicks feel like one continuous motion.
 */
export function getRetargetedButtonZoomModifier(
    currentZoomModifier: number,
    zoomFactor: number,
    targetZoomModifier: number | undefined,
): number {
    return (targetZoomModifier ?? currentZoomModifier) * zoomFactor;
}

/**
 * Computes the click animation position using elapsed time from the beginning of the current click animation.
 * CameraManager resets the start value and elapsed time every time the click target is retargeted.
 */
export function getSmoothButtonZoomModifier(
    currentZoomModifier: number,
    targetZoomModifier: number,
    deltaMs: number,
    durationMs = SMOOTH_BUTTON_ZOOM_DURATION,
): number {
    if (durationMs <= 0) {
        return targetZoomModifier;
    }

    if (deltaMs >= durationMs) {
        return targetZoomModifier;
    }

    const progress = deltaMs / durationMs;
    const easedProgress = -(Math.cos(Math.PI * progress) - 1) / 2;
    return currentZoomModifier + (targetZoomModifier - currentZoomModifier) * easedProgress;
}

/**
 * Converts a per-second zoom factor to the factor that should be applied during one Phaser update frame.
 */
export function getContinuousButtonZoomFactor(zoomFactorPerSecond: number, deltaMs: number): number {
    return Math.pow(zoomFactorPerSecond, deltaMs / 1000);
}
