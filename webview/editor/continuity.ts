
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { planRebuildRestore, type TextSelectionRange } from "../app/rebuildRestore";

export interface EditorContinuity {
    hadEditorFocus: boolean;
    previousSelection: TextSelectionRange | null;
    previousDoc: ProseNode | null;
    previousScrollY: number;
}

export function captureContinuity(view: EditorView): EditorContinuity {
    const sel = view.state.selection;
    return {
        hadEditorFocus: view.hasFocus(),
        previousSelection: sel instanceof TextSelection ? { from: sel.from, to: sel.to } : null,
        previousDoc: view.state.doc,
        previousScrollY: window.scrollY,
    };
}

export function restoreContinuity(
    view: EditorView,
    continuity: EditorContinuity,
    options: { isActivePanel: boolean },
): boolean {
    const plan = planRebuildRestore({
        hadEditorFocus: continuity.hadEditorFocus,
        isActivePanel: options.isActivePanel,
        previousSelection: continuity.previousSelection,
        docUnchanged: continuity.previousDoc !== null && view.state.doc.eq(continuity.previousDoc),
        docSize: view.state.doc.content.size,
        previousScrollY: continuity.previousScrollY,
    });

    if (plan.selection) { applySelection(view, plan.selection); }
    if (plan.restoreFocus) { view.focus(); }

    if (plan.scrollY !== null) {
        const top = plan.scrollY;
        window.scrollTo({ top });

        requestAnimationFrame(() => {
            if (window.scrollY !== top) { window.scrollTo({ top }); }
        });
    }
    return plan.restoreFocus;
}

export function restoreSelection(view: EditorView, selection: TextSelectionRange): boolean {
    const docSize = view.state.doc.content.size;
    const clamp = (pos: number): number => Math.max(0, Math.min(pos, docSize));
    const from = clamp(Math.min(selection.from, selection.to));
    const to = clamp(Math.max(selection.from, selection.to));
    return applySelection(view, { from, to });
}

function applySelection(view: EditorView, selection: TextSelectionRange): boolean {
    const { from, to } = selection;
    try {
        view.dispatch(view.state.tr.setSelection(
            from === to
                ? TextSelection.near(view.state.doc.resolve(from))
                : TextSelection.create(view.state.doc, from, to),
        ));
        return true;
    } catch {
        return false;
    }
}
