import { schemaCtx } from "@milkdown/kit/core";
import { keymap } from "@milkdown/kit/prose/keymap";
import type { Attrs } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import { liftListItem, splitListItem } from "@milkdown/kit/prose/schema-list";
import { canSplit } from "@milkdown/kit/prose/transform";
import { $prose } from "@milkdown/kit/utils";

/**
 * Enter inside a task item: a new item is always unchecked (regression), and Enter in
 * an empty item lifts it instead of producing a plain bullet (regression).
 *
 * Both come from the official `splitListItem`: its normal path ignores `itemAttrs`, so
 * the new item copies the split node's attrs (checked included); its empty-item path
 * uses `itemType.createAndFill()` (checked = null), turning the item into a bullet.
 * Top-level empty items happen to fall through to `liftEmptyBlock` and behave, so the
 * bullet symptom only appeared in nested task lists.
 *
 * Hence: empty item -> `liftListItem`; checked item at end of item -> official split
 * with `checked: false`; checked item mid-item -> explicit split (the official
 * mid-item branch always copies attrs); everything else stays with the default keymap.
 */

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

            // Empty item: lift. The upstream empty branch would create a checked:null bullet.
            if ($from.parent.content.size === 0 && item.childCount === $from.indexAfter(-1)) {
                return lift(state, dispatch);
            }

            // Only checked items need fixing; unchecked ones already copy correctly.
            if (checked !== true) { return false; }

            const attrs: Attrs = { ...item.attrs, checked: false };

            if ($to.pos === $from.end()) {
                return splitListItem(listItem, attrs)(state, dispatch);
            }

            // Mid-item: official branch copies attrs, so build the split explicitly.
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
