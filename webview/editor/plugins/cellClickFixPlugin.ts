
import { $prose } from "@milkdown/kit/utils";
import { Plugin, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { CellSelection } from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import {
    beginClick,
    consumeCellClickTarget,
    createCellClickState,
    decideCellSelection,
    endClick,
    markDragged,
} from "../../table/cellClickState";

function atomPosAtEvent(view: EditorView, event: MouseEvent): number | null {
    const target = event.target as Element | null;
    if (!target) return null;
    const atomEl = target.closest<HTMLElement>("[data-type='math_inline']");
    if (!atomEl) return null;
    try {
        const pos = view.posAtDOM(atomEl, 0);
        const node = view.state.doc.nodeAt(pos);
        return node && node.isAtom ? pos : null;
    } catch {
        return null;
    }
}

function cellStartAt(doc: ProseNode, pos: number): number {
    const $pos = doc.resolve(Math.min(pos, doc.content.size));
    for (let d = $pos.depth; d >= 0; d--) {
        const name = $pos.node(d).type.name;
        if (name === "table_cell" || name === "table_header") { return $pos.start(d); }
    }
    return -1;
}

export const cellClickFixPlugin = $prose(() => {
    const cell = createCellClickState();
    let capturedView: EditorView | null = null;



    let pendingAtomClickPos: number | null = null;

    return new Plugin({
        view(editorView) {
            capturedView = editorView;



            const onCaptureMouseDown = (event: MouseEvent) => {
                if (event.button !== 0 || event.detail !== 1 ||
                    event.shiftKey || event.ctrlKey || event.metaKey) {
                    pendingAtomClickPos = null;
                    return;
                }
                const atomPos = atomPosAtEvent(editorView, event);
                pendingAtomClickPos = atomPos;
                if (atomPos === null) return;



                const pinSelectionToAtom = () => {
                    const node = editorView.state.doc.nodeAt(atomPos);
                    if (!node?.isAtom) return;
                    const sel = editorView.state.selection;
                    if (sel instanceof NodeSelection && sel.from === atomPos) return;
                    try {
                        editorView.dispatch(
                            editorView.state.tr.setSelection(
                                NodeSelection.create(editorView.state.doc, atomPos),
                            ),
                        );
                    } catch {  }
                };

                pinSelectionToAtom();
                requestAnimationFrame(() => {
                    pinSelectionToAtom();
                    requestAnimationFrame(() => {
                        pinSelectionToAtom();

                        pendingAtomClickPos = null;
                    });
                });
            };
            document.addEventListener("mousedown", onCaptureMouseDown, true);

            return {
                destroy() {
                    document.removeEventListener("mousedown", onCaptureMouseDown, true);
                    capturedView = null;
                },
            };
        },
        props: {
            handleDOMEvents: {
                mousedown: (view, event) => {
                    if (event.button !== 0 || event.detail !== 1 || event.shiftKey || event.ctrlKey || event.metaKey) {
                        beginClick(cell, null);
                        return false;
                    }
                    if (!(event.target as Element).closest("td, th")) {
                        beginClick(cell, null);
                        return false;
                    }
                    const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
                    beginClick(cell, at ? { pos: at.pos, x: event.clientX, y: event.clientY } : null);

                    const originX = event.clientX;
                    const originY = event.clientY;
                    const onMove = (mv: MouseEvent) => markDragged(cell, mv.clientX, mv.clientY, originX, originY);
                    document.addEventListener("mousemove", onMove, true);

                    const cleanup = () => {
                        document.removeEventListener("mouseup", cleanup, true);
                        document.removeEventListener("mousemove", onMove, true);
                        endClick(cell);
                    };
                    document.addEventListener("mouseup", cleanup, true);
                    return false;
                },
            },
        },
        filterTransaction(tr, state) {


            if (pendingAtomClickPos !== null) return true;


            if (tr.selection instanceof NodeSelection) {

                if (tr.selection.node?.isAtom) return true;
                try {
                    const $pos = state.doc.resolve(Math.min(tr.selection.from, state.doc.content.size));
                    for (let d = $pos.depth; d >= 0; d--) {
                        const t = $pos.node(d).type.name;
                        if (t === "table_cell" || t === "table_header") {

                            const clickPos = consumeCellClickTarget(cell);
                            requestAnimationFrame(() => {
                                const v = capturedView;
                                if (!v) return;

                                if (pendingAtomClickPos !== null) return;
                                const sel = v.state.selection;
                                if (sel instanceof TextSelection && sel.from === sel.to) return;
                                if (sel instanceof NodeSelection && sel.node?.isAtom) return;
                                try {
                                    const p = Math.min(clickPos ?? tr.selection.from, v.state.doc.content.size);
                                    v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(p))));
                                } catch {  }
                            });
                            return false;
                        }
                    }
                } catch {  }
            }
            if (!cell.lastGoodCellSelection) return true;
            if (state.selection instanceof CellSelection && !(tr.selection instanceof CellSelection)) {
                return false;
            }
            return true;
        },
        appendTransaction(_trs, _oldState, newState) {


            if (pendingAtomClickPos !== null) {
                const atomPos = pendingAtomClickPos;


                const node = newState.doc.nodeAt(atomPos);
                if (node?.isAtom) {
                    const isAlreadyOnAtom =
                        newState.selection instanceof NodeSelection &&
                        newState.selection.from === atomPos;
                    if (!isAlreadyOnAtom) {
                        return newState.tr.setSelection(
                            NodeSelection.create(newState.doc, atomPos),
                        );
                    }
                }
                return null;
            }

            if (cell.pendingClickPos === null) return null;
            const sel = newState.selection;
            if (!(sel instanceof CellSelection)) { return null; }
            if (sel.isRowSelection() || sel.isColSelection()) { return null; }

            const decision = decideCellSelection(cell, {
                isRowOrCol: false,
                anchorCellPos: sel.$anchorCell.pos,
                headCellPos: sel.$headCell.pos,
            });
            if (decision.kind === "rememberCrossCell") {
                cell.lastGoodCellSelection = sel;
                return null;
            }

            const clickPos = cell.pendingClickPos;
            const $pos = newState.doc.resolve(Math.min(clickPos, newState.doc.content.size));
            try {
                if (!cell.clickIsPlain && capturedView) {
                    const toCoords = capturedView.posAtCoords({ left: cell.lastMouseX, top: cell.lastMouseY });
                    if (toCoords) {
                        const headP = Math.min(toCoords.pos, newState.doc.content.size);
                        try {
                            if (cellStartAt(newState.doc, clickPos) !== cellStartAt(newState.doc, headP)) { return null; }
                        } catch {  }
                        return newState.tr.setSelection(
                            TextSelection.create(newState.doc, headP, Math.min(clickPos, newState.doc.content.size)),
                        );
                    }
                }
                return newState.tr.setSelection(TextSelection.near($pos));
            } catch {  return null; }
        },
    });
});
