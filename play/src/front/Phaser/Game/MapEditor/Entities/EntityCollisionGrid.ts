const MAP_TILE_SIZE = 32;

export function getScaledCollisionGridFrame(
    sourceGrid: number[][] | undefined,
    sourceAssetWidth: number,
    sourceAssetHeight: number,
    displayWidth: number,
    displayHeight: number,
    previewOffsetX = 0,
    previewOffsetY = 0,
): { collisionGrid: number[][] | undefined; offset: { x: number; y: number } } {
    if (!sourceGrid?.length || !sourceGrid[0]?.length || sourceAssetWidth <= 0 || sourceAssetHeight <= 0) {
        return { collisionGrid: sourceGrid, offset: { x: 0, y: 0 } };
    }

    const columns = Math.max(...sourceGrid.map((row) => row.length));
    const sourceGridWidth = columns * MAP_TILE_SIZE;
    const sourceGridHeight = sourceGrid.length * MAP_TILE_SIZE;
    const scaleX = displayWidth / sourceAssetWidth;
    const scaleY = displayHeight / sourceAssetHeight;
    return {
        collisionGrid: scaleEntityCollisionGrid(sourceGrid, sourceGridWidth * scaleX, sourceGridHeight * scaleY),
        offset: {
            x: ((sourceAssetWidth - sourceGridWidth) / 2 + previewOffsetX) * scaleX,
            y: ((sourceAssetHeight - sourceGridHeight) / 2 + previewOffsetY) * scaleY,
        },
    };
}

export function getCollisionGridOffset(
    collisionGrid: number[][] | undefined,
    displayWidth: number,
    displayHeight: number,
    previewOffsetX = 0,
    previewOffsetY = 0,
): { x: number; y: number } {
    if (!collisionGrid?.length || !collisionGrid[0]?.length) {
        return { x: 0, y: 0 };
    }

    const columns = Math.max(...collisionGrid.map((row) => row.length));
    return {
        x: (displayWidth - columns * MAP_TILE_SIZE) / 2 + previewOffsetX,
        y: (displayHeight - collisionGrid.length * MAP_TILE_SIZE) / 2 + previewOffsetY,
    };
}

export function scaleEntityCollisionGrid(
    sourceGrid: number[][] | undefined,
    displayWidth: number,
    displayHeight: number,
): number[][] | undefined {
    if (!sourceGrid?.length || !sourceGrid[0]?.length || displayWidth <= 0 || displayHeight <= 0) {
        return sourceGrid;
    }

    const sourceRows = sourceGrid.length;
    const sourceColumns = Math.max(...sourceGrid.map((row) => row.length));
    const targetRows = Math.max(1, Math.ceil(displayHeight / MAP_TILE_SIZE));
    const targetColumns = Math.max(1, Math.ceil(displayWidth / MAP_TILE_SIZE));

    return Array.from({ length: targetRows }, (_, targetRow) =>
        Array.from({ length: targetColumns }, (_, targetColumn) => {
            const sourceRowStart = Math.floor((targetRow * sourceRows) / targetRows);
            const sourceRowEnd = Math.max(sourceRowStart, Math.ceil(((targetRow + 1) * sourceRows) / targetRows) - 1);
            const sourceColumnStart = Math.floor((targetColumn * sourceColumns) / targetColumns);
            const sourceColumnEnd = Math.max(
                sourceColumnStart,
                Math.ceil(((targetColumn + 1) * sourceColumns) / targetColumns) - 1,
            );

            for (let row = sourceRowStart; row <= sourceRowEnd; row += 1) {
                for (let column = sourceColumnStart; column <= sourceColumnEnd; column += 1) {
                    if (sourceGrid[row]?.[column] === 1) {
                        return 1;
                    }
                }
            }
            return 0;
        }),
    );
}

export function reverseEntityCollisionGrid(collisionGrid: number[][] | undefined): number[][] | undefined {
    return collisionGrid?.map((row) => row.map((value) => (value === 1 ? -1 : value)));
}
