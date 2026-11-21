import { schemaCtx } from "@milkdown/kit/core";
import { keymap } from "@milkdown/kit/prose/keymap";
import type { Attrs } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import { liftListItem, splitListItem } from "@milkdown/kit/prose/schema-list";
import { canSplit } from "@milkdown/kit/prose/transform";
import { $prose } from "@milkdown/kit/utils";



export const taskListItemEnterPlugin = $prose((ctx) => {
    const listItem = ctx.get(schemaCtx).nodes["list_item"];
    if (!listItem) { return new Plugin({}); }

    const lift = liftListItem(listItem);

    return keymap({
        Enter: (state, dispatch) => {
            const { $from, $to } = state.selection;
            if ($from.depth < 2 || !$from.sameParent($to)) { return false; }

            const item = $from.node(-1);
            if (item.type !== listItem) { return false; }
            const checked = item.attrs.checked;
            if (checked !== true && checked !== false) { return false; }


            if ($from.parent.content.size === 0 && item.childCount === $from.indexAfter(-1)) {
                return lift(state, dispatch);
            }


            if (checked !== true) { return false; }

            const attrs: Attrs = { ...item.attrs, checked: false };

            if ($to.pos === $from.end()) {
                return splitListItem(listItem, attrs)(state, dispatch);
            }


            const typesAfter = [
                { type: listItem, attrs },
                { type: $from.parent.type, attrs: $from.parent.attrs },
            ];
            const tr = state.tr.delete($from.pos, $to.pos);
            if (!canSplit(tr.doc, $from.pos, 2, typesAfter)) { return false; }
            if (dispatch) { dispatch(tr.split($from.pos, 2, typesAfter).scrollIntoView()); }
            return true;
        },
    });
});
