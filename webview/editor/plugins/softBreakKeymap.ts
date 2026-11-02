/**
 * Soft-break keymap: Shift+Enter always inserts a hardbreak.
 *
 * Regression: with upstream `hardbreakKeymap` + `hardbreakFilterNodes`, Shift+Enter on a line
 * that already ends in a hardbreak ran `insertHardbreakCommand`, which turns it into a
 * paragraph — the opposite of what users expect inside a table cell, where it should simply
 * add another line. So this keymap always inserts the hardbreak; in code blocks it returns
 * false and lets upstream handle the key (its filter takes over).
 *
 * The only departure from upstream is that existing-hardbreak case. Allowing hardbreaks inside
 * tables is `hardbreakFilterNodes`'s job in editor.ts; this keymap sets no "hardbreak" meta and
 * is therefore unaffected by that filter.
 */
import { schemaCtx } from "@milkdown/kit/core";
import { keymap } from "@milkdown/kit/prose/keymap";
import { $prose } from "@milkdown/kit/utils";

export const softBreakKeymap = $prose((ctx) => {
    const schema = ctx.get(schemaCtx);
    return keymap({
        "Shift-Enter": (state, dispatch) => {
            const { $from } = state.selection;
            for (let d = $from.depth; d >= 0; d--) {
                if ($from.node(d).type.name === "code_block") return false;
            }
            const hardbreak = schema.nodes["hardbreak"];
            if (!hardbreak) return false;
            if (dispatch) {
                dispatch(state.tr.replaceSelectionWith(hardbreak.create()).scrollIntoView());
            }
            return true;
        },
    });
});
