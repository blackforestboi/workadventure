export type EntityBounds = { x: number; y: number; width: number; height: number };
export type EntityResizeCorner = "north-west" | "north-east" | "south-east" | "south-west";

const MINIMUM_SIZE = 16;

export function resizeBoundsFromCorner(
    bounds: EntityBounds,
    corner: EntityResizeCorner,
    pointerX: number,
    pointerY: number,
    preserveAspectRatio = true,
): EntityBounds {
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const movesWest = corner === "north-west" || corner === "south-west";
    const movesNorth = corner === "north-west" || corner === "north-east";

    if (preserveAspectRatio) {
        const anchorX = movesWest ? right : bounds.x;
        const anchorY = movesNorth ? bottom : bounds.y;
        const pointerWidth = movesWest ? anchorX - pointerX : pointerX - anchorX;
        const pointerHeight = movesNorth ? anchorY - pointerY : pointerY - anchorY;
        const projectedScale =
            (pointerWidth * bounds.width + pointerHeight * bounds.height) /
            (bounds.width * bounds.width + bounds.height * bounds.height);
        const minimumScale = Math.max(MINIMUM_SIZE / bounds.width, MINIMUM_SIZE / bounds.height);
        const scale = Math.max(projectedScale, minimumScale);
        const width = Math.max(MINIMUM_SIZE, Math.round(bounds.width * scale));
        const height = Math.max(MINIMUM_SIZE, Math.round(bounds.height * scale));

        return {
            x: Math.round(movesWest ? anchorX - width : anchorX),
            y: Math.round(movesNorth ? anchorY - height : anchorY),
            width,
            height,
        };
    }

    const x = movesWest ? Math.min(pointerX, right - MINIMUM_SIZE) : bounds.x;
    const y = movesNorth ? Math.min(pointerY, bottom - MINIMUM_SIZE) : bounds.y;
    const nextRight = movesWest ? right : Math.max(pointerX, bounds.x + MINIMUM_SIZE);
    const nextBottom = movesNorth ? bottom : Math.max(pointerY, bounds.y + MINIMUM_SIZE);
    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(nextRight - x),
        height: Math.round(nextBottom - y),
    };
}
