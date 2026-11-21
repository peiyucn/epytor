
import { $prose } from "@milkdown/kit/utils";
import { Plugin, TextSelection, type Transaction } from "@milkdown/kit/prose/state";
import { ReplaceStep } from "@milkdown/kit/prose/transform";

const FULL_WIDTH_COLON = "：";

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
                        } catch {}
                    };

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
