export const TABLE_GRID_SIZE = 8;

export function gridIndexToCell(index: number): { row: number; col: number } {
    return {
        row: Math.floor(index / TABLE_GRID_SIZE) + 1,
        col: (index % TABLE_GRID_SIZE) + 1,
    };
}

export function isCellHighlighted(idx: number, hoverRow: number, hoverCol: number): boolean {
    const { row, col } = gridIndexToCell(idx);
    return row <= hoverRow && col <= hoverCol;
}
