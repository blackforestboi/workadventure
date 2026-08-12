// The 32px cells are an authoring aid only. Runtime collision geometry remains
// in the placed asset's pixel coordinate system and is never snapped to map tiles.
const ASSET_AUTHORING_TILE_SIZE = 32;

export type EntityCollisionFrame = {
    collisionGrid: number[][] | undefined;
    offset: { x: number; y: number };
    width: number;
    height: number;
};

export type EntityCollisionRectangle = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export function getScaledCollisionGridFrame(
    sourceGrid: number[][] | undefined,
    sourceAssetWidth: number,
    sourceAssetHeight: number,
    displayWidth: number,
    displayHeight: number,
    previewOffsetX = 0,
    previewOffsetY = 0,
    sourceFrameWidth?: number,
    sourceFrameHeight?: number,
): EntityCollisionFrame {
    if (!sourceGrid?.length || !sourceGrid[0]?.length || sourceAssetWidth <= 0 || sourceAssetHeight <= 0) {
        return { collisionGrid: sourceGrid, offset: { x: 0, y: 0 }, width: 0, height: 0 };
    }

    const columns = Math.max(...sourceGrid.map((row) => row.length));
    const sourceGridWidth = sourceFrameWidth ?? columns * ASSET_AUTHORING_TILE_SIZE;
    const sourceGridHeight = sourceFrameHeight ?? sourceGrid.length * ASSET_AUTHORING_TILE_SIZE;
    const scaleX = displayWidth / sourceAssetWidth;
    const scaleY = displayHeight / sourceAssetHeight;
    return {
        collisionGrid: sourceGrid,
        offset: {
            x: ((sourceAssetWidth - sourceGridWidth) / 2 - previewOffsetX) * scaleX,
            y: ((sourceAssetHeight - sourceGridHeight) / 2 - previewOffsetY) * scaleY,
        },
        width: sourceGridWidth * scaleX,
        height: sourceGridHeight * scaleY,
    };
}

export function getEntityCollisionRectangles(
    frame: EntityCollisionFrame,
    entityPosition: { x: number; y: number },
): EntityCollisionRectangle[] {
    const sourceGrid = frame.collisionGrid;
    if (!sourceGrid?.length || !sourceGrid[0]?.length || frame.width <= 0 || frame.height <= 0) {
        return [];
    }

    const rows = sourceGrid.length;
    const columns = Math.max(...sourceGrid.map((row) => row.length));
    const cellWidth = frame.width / columns;
    const cellHeight = frame.height / rows;
    const rectangles: EntityCollisionRectangle[] = [];

    for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
            if (sourceGrid[row]?.[column] !== 1) continue;
            rectangles.push({
                x: entityPosition.x + frame.offset.x + column * cellWidth,
                y: entityPosition.y + frame.offset.y + row * cellHeight,
                width: cellWidth,
                height: cellHeight,
            });
        }
    }

    return rectangles;
}

export function collisionRectanglesOverlap(left: EntityCollisionRectangle, right: EntityCollisionRectangle): boolean {
    return (
        left.x < right.x + right.width &&
        left.x + left.width > right.x &&
        left.y < right.y + right.height &&
        left.y + left.height > right.y
    );
}
