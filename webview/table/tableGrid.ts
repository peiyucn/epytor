export const TABLE_GRID_SIZE = 8;

/** Flat grid index -> 1-based (row, col). */
export function gridIndexToCell(index: number): { row: number; col: number } {
    return {
        row: Math.floor(index / TABLE_GRID_SIZE) + 1,
        col: (index % TABLE_GRID_SIZE) + 1,
    };
}

/** Whether cell `idx` is inside the r x c rectangle hovered so far. */
export function isCellHighlighted(idx: number, hoverRow: number, hoverCol: number): boolean {
    const { row, col } = gridIndexToCell(idx);
    return row <= hoverRow && col <= hoverCol;
}
