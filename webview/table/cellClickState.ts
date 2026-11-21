


const DRAG_THRESHOLD_PX = 4;


const CELL_SELECTION_CLEAR_DELAY_MS = 200;

export interface ClickPoint {
    pos: number;
    x: number;
    y: number;
}

export interface CellClickState {

    pendingClickPos: number | null;

    cellClickTarget: number | null;

    clickIsPlain: boolean;

    wasCrossCell: boolean;

    lastGoodCellSelection: unknown;

    lastMouseX: number;
    lastMouseY: number;
}

export function createCellClickState(): CellClickState {
    return {
        pendingClickPos: null,
        cellClickTarget: null,
        clickIsPlain: true,
        wasCrossCell: false,
        lastGoodCellSelection: null,
        lastMouseX: 0,
        lastMouseY: 0,
    };
}


export function beginClick(state: CellClickState, point: ClickPoint | null): void {
    if (!point) {
        state.pendingClickPos = null;
        state.cellClickTarget = null;
        return;
    }
    state.pendingClickPos = point.pos;
    state.cellClickTarget = point.pos;
    state.clickIsPlain = true;
    state.wasCrossCell = false;
    state.lastGoodCellSelection = null;
    state.lastMouseX = point.x;
    state.lastMouseY = point.y;
}

export function markDragged(state: CellClickState, x: number, y: number, originX: number, originY: number): void {
    state.lastMouseX = x;
    state.lastMouseY = y;
    if (Math.abs(x - originX) + Math.abs(y - originY) > DRAG_THRESHOLD_PX) {
        state.clickIsPlain = false;
    }
}


export function endClick(state: CellClickState): void {
    if (state.wasCrossCell) {
        state.pendingClickPos = null;
        state.clickIsPlain = true;
        state.wasCrossCell = false;
        const saved = state.lastGoodCellSelection;
        setTimeout(() => {
            if (state.lastGoodCellSelection === saved) { state.lastGoodCellSelection = null; }
        }, CELL_SELECTION_CLEAR_DELAY_MS);
        return;
    }
    Promise.resolve().then(() => {
        state.pendingClickPos = null;
        state.clickIsPlain = true;
    });
}


export type CellSelectionDecision =

    | { kind: "ignore" }

    | { kind: "rememberCrossCell" }

    | { kind: "toCursor" };

export function decideCellSelection(
    state: CellClickState,
    info: { isRowOrCol: boolean; anchorCellPos: number; headCellPos: number },
): CellSelectionDecision {
    if (info.isRowOrCol) { return { kind: "ignore" }; }
    if (info.anchorCellPos !== info.headCellPos) {
        state.wasCrossCell = true;
        return { kind: "rememberCrossCell" };
    }
    return { kind: "toCursor" };
}


export function consumeCellClickTarget(state: CellClickState): number | null {
    const pos = state.cellClickTarget;
    state.cellClickTarget = null;
    return pos;
}
