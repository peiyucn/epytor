/**
 * Caret guards around IME composition and full-width colons.
 *
 * Chrome can resolve the post-input caret one character past the inserted text; the caret
 * then visibly sits after the following character. Two independent guards cover the known
 * paths:
 *
 * - `appendTransaction`: a transaction that inserts exactly a full-width colon and leaves
 *   the caret at insertion end + 1. This catches direct `insertText` and DOM-observer
 *   commits that do not expose a usable composition marker.
 * - `compositionend`: fall back to the paragraph text when Chrome reports the selection
 *   only after the observer flush. If the composed text ends one character before the
 *   cursor, put the caret back at the end of the composed text.
 */
import { $prose } from "@milkdown/kit/utils";
import { Plugin, TextSelection, type Transaction } from "@milkdown/kit/prose/state";
import { ReplaceStep } from "@milkdown/kit/prose/transform";

const FULL_WIDTH_COLON = "：";

/** The replacement step that inserts exactly the full-width colon, if any. */
function colonInsertionStep(tr: Transaction): ReplaceStep | null {
    for (const step of tr.steps) {
        if (!(step instanceof ReplaceStep) || step.slice.size !== 1) { continue; }
        if (step.slice.content.textBetween(0, step.slice.size, "\n", "\n") === FULL_WIDTH_COLON) {
            return step;
        }
    }
    return null;
}

export const imeCaretGuardPlugin = $prose(() => {
    let compositionText = "";

    return new Plugin({
        props: {
            handleDOMEvents: {
                compositionstart: () => {
                    compositionText = "";
                    return false;
                },
                compositionupdate: (_view, event) => {
                    compositionText = event.data ?? compositionText;
                    return false;
                },
                compositionend: (view, event) => {
                    const text = event.data ?? compositionText;
                    compositionText = "";
                    if (!text) { return false; }

                    const fix = (): void => {
                        if (view.isDestroyed || !view.state.selection.empty) { return; }
                        const $from = view.state.selection.$from;
                        const before = $from.parent.textContent.slice(0, $from.parentOffset);
                        const index = before.lastIndexOf(text);
                        if (index < 0 || index + text.length !== before.length - 1) { return; }
                        try {
                            view.dispatch(
                                view.state.tr.setSelection(
                                    TextSelection.create(view.state.doc, view.state.selection.from - 1),
                                ),
                            );
                        } catch { /* position vanished */ }
                    };

                    // Wait for the DOM observer to commit the composition; a second rAF pass
                    // covers Chrome reporting its final selection one frame later.
                    setTimeout(() => {
                        fix();
                        if (typeof requestAnimationFrame === "function") { requestAnimationFrame(fix); }
                    }, 0);
                    return false;
                },
            },
        },
        appendTransaction(transactions, _oldState, newState) {
            if (!newState.selection.empty) { return null; }
            for (const tr of transactions) {
                const step = colonInsertionStep(tr);
                if (!step) { continue; }
                const expected = step.from + step.slice.size;
                if (newState.selection.from !== expected + 1) { continue; }
                return newState.tr.setSelection(TextSelection.create(newState.doc, expected));
            }
            return null;
        },
    });
});
