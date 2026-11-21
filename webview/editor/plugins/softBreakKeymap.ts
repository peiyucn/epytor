
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
