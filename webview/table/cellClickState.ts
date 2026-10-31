/**
 * Table cell click correction (pure state machine for `cellClickFixPlugin`).
 *
 * ProseMirror turns a plain click inside a cell into a NodeSelection or a
 * single-cell CellSelection instead of placing the caret, yet a cross-cell drag must
 * keep its CellSelection. The plugin callbacks only translate events into transitions;
 * all mutable state lives here.
 */

/** Movement (Manhattan distance, px) below which a press counts as a plain click. */
const DRAG_THRESHOLD_PX = 4;

/** Delay before forgetting a cross-cell selection; the trailing click must resolve first. */
const CELL_SELECTION_CLEAR_DELAY_MS = 200;

export interface ClickPoint {
    pos: number;
    x: number;
    y: number;
}

export interface CellClickState {
    /** Doc position of the last mousedown (null = this click is not tracked). */
    pendingClickPos: number | null;
    /** Click position, kept across mouseup: appendTransaction may arrive later. */
    cellClickTarget: number | null;
    /** Whether the press never moved noticeably. */
    clickIsPlain: boolean;
    /** Whether this press was a cross-cell drag. */
    wasCrossCell: boolean;
    /** Last whole-cell selection, used to turn the following click into a caret. */
    lastGoodCellSelection: unknown;
    /** Last pointer position (drag end); used to convert the selection to anchor/head. */
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

/** Untracked press (outside a table / modifier held): clear both memories, or a later filter uses stale ones. */
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

/**
 * mouseup: a cross-cell drag keeps its selection memory, cleared on a timer once the
 * trailing click has been handled; a plain click clears `pending` in a microtask so
 * an appendTransaction from the same event loop still sees it.
 */
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

/** What appendTransaction should do on seeing a CellSelection. */
export type CellSelectionDecision =
    /** Whole row/column selected: leave it alone. */
    | { kind: "ignore" }
    /** Cross-cell drag: remember the selection, do not convert. */
    | { kind: "rememberCrossCell" }
    /** Single cell: convert to a caret (caller computes the position). */
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

/** Read and forget the click target (single use, caret path only). */
export function consumeCellClickTarget(state: CellClickState): number | null {
    const pos = state.cellClickTarget;
    state.cellClickTarget = null;
    return pos;
}
