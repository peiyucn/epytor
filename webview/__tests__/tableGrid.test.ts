import { describe, expect, it } from "vitest";
import { TABLE_GRID_SIZE, gridIndexToCell, isCellHighlighted } from "../table/tableGrid";

describe("tableGrid 纯逻辑", () => {
    it("gridIndexToCell 应该 正确换算 1-based 行列", () => {
        expect(gridIndexToCell(0)).toEqual({ row: 1, col: 1 });
        expect(gridIndexToCell(TABLE_GRID_SIZE - 1)).toEqual({ row: 1, col: TABLE_GRID_SIZE });
        expect(gridIndexToCell(TABLE_GRID_SIZE)).toEqual({ row: 2, col: 1 });
        expect(gridIndexToCell(TABLE_GRID_SIZE * TABLE_GRID_SIZE - 1)).toEqual({
            row: TABLE_GRID_SIZE,
            col: TABLE_GRID_SIZE,
        });
    });

    it("isCellHighlighted 应该 只高亮左上角 hover 区域", () => {

        expect(isCellHighlighted(0, 3, 4)).toBe(true);
        expect(isCellHighlighted(7, 3, 4)).toBe(false);
        expect(isCellHighlighted(8, 3, 4)).toBe(true);

        const idx = (4 - 1) * TABLE_GRID_SIZE + (3 - 1);
        expect(isCellHighlighted(idx, 3, 4)).toBe(false);

        const edge = (3 - 1) * TABLE_GRID_SIZE + (4 - 1);
        expect(isCellHighlighted(edge, 3, 4)).toBe(true);

        expect(isCellHighlighted(edge + 1, 3, 4)).toBe(false);
    });
});
