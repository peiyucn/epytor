/**
 * Editor continuity across a rebuild: focus, selection and scroll are captured from the dying
 * view and replayed on the new one.
 *
 * Regression: every revert dropped focus to <body>, so the keyboard died after an external
 * file change. The restore plan itself lives in `app/rebuildRestore.ts`; this module only
 * translates between editor-view state and that plan.
 */
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

/** Snapshot focus/selection/scroll from the current view before the editor is destroyed. */
export function captureContinuity(view: EditorView): EditorContinuity {
    const sel = view.state.selection;
    return {
        hadEditorFocus: view.hasFocus(),
        previousSelection: sel instanceof TextSelection ? { from: sel.from, to: sel.to } : null,
        previousDoc: view.state.doc,
        previousScrollY: window.scrollY,
    };
}

/**
 * Restore focus / selection / scroll after a rebuild, which otherwise leaves focus on
 * `<body>`. Regression: even a no-op revert killed the keyboard.
 */
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
        // Layout can settle one frame late (images, mermaid, folds); re-correct then.
        requestAnimationFrame(() => {
            if (window.scrollY !== top) { window.scrollTo({ top }); }
        });
    }
    return plan.restoreFocus;
}

/** Restore a persisted selection after a full reload; does not scroll or steal focus. */
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
