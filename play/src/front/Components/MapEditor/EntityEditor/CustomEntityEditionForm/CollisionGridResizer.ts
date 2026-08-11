export function resizeCollisionGrid(sourceGrid: number[][], rows: number, columns: number): number[][] {
    const targetRows = Math.max(1, rows);
    const targetColumns = Math.max(1, columns);

    if (sourceGrid.length === 0 || sourceGrid.every((row) => row.length === 0)) {
        return createEmptyCollisionGrid(targetRows, targetColumns);
    }

    const sourceRows = sourceGrid.length;
    const sourceColumns = Math.max(1, ...sourceGrid.map((row) => row.length));

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
                    if (sourceGrid[row]?.[column] === 1) return 1;
                }
            }
            return 0;
        }),
    );
}

export function createEmptyCollisionGrid(rows: number, columns: number): number[][] {
    return Array.from({ length: Math.max(1, rows) }, () => Array(Math.max(1, columns)).fill(0));
}
