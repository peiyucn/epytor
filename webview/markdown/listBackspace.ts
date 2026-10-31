import { $prose } from "@milkdown/kit/utils";
import { schemaCtx } from "@milkdown/kit/core";
import { keymap } from "@milkdown/kit/prose/keymap";
import type { Transaction } from "@milkdown/kit/prose/state";
import { Plugin } from "@milkdown/kit/prose/state";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import type { NodeType, ResolvedPos } from "@milkdown/kit/prose/model";

/**
 * Backspace at the start of a list item: break the list and turn the item into a plain
 * line, rather than merging it into the previous item.
 *
 * Regression: the list_item schema allows multiple blocks per item, so ProseMirror's
 * joinBackward merged an empty item into the previous one as a second (empty)
 * paragraph and the caret landed there. `liftListItem` lifts a top-level item to a
 * paragraph (splitting the list) and a nested one by a level.
 *
 * The lifted tail needs its start number: liftListItem copies the original `order` to
 * the tail, which restarted numbering ("1. a / b / 1. c"). Write back
 * originalIndex + 1.
 */

/** Depth of the enclosing list_item, or -1. */
function listItemDepth($from: ResolvedPos, listItem: NodeType): number {
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === listItem) { return depth; }
    }
    return -1;
}

/**
 * After lifting, if the following sibling is an ordered list created by the split,
 * set its start number. Position is read from the lifted paragraph's next sibling, so
 * no position mapping is involved.
 */
function withContinuationOrder(tr: Transaction, order: number): Transaction {
    const { $from } = tr.selection;
    if (!$from.parent.isTextblock || $from.depth < 1) { return tr; }
    const parentDepth = $from.depth - 1;
    const parent = $from.node(parentDepth);
    const nextIndex = $from.index(parentDepth) + 1;
    if (nextIndex >= parent.childCount) { return tr; }
    const next = parent.child(nextIndex);
    if (next.type.name !== "ordered_list") { return tr; }
    return tr.setNodeMarkup($from.after($from.depth), undefined, { ...next.attrs, order });
}

export const listBackspacePlugin = $prose((ctx) => {
    const listItem = ctx.get(schemaCtx).nodes["list_item"];
    if (!listItem) { return new Plugin({}); }
    const lift = liftListItem(listItem);

    return keymap({
        Backspace: (state, dispatch) => {
            const { selection } = state;
            if (!selection.empty) { return false; }
            const { $from } = selection;
            if ($from.parentOffset !== 0 || !$from.parent.isTextblock) { return false; }
            const itemDepth = listItemDepth($from, listItem);
            if (itemDepth < 0) { return false; }
            // Only the first text block of the item; later blocks keep the default behavior.
            if ($from.index(itemDepth) !== 0) { return false; }

            const listNode = $from.node(itemDepth - 1);
            const itemIndex = $from.index(itemDepth - 1);
            const continues = listNode.type.name === "ordered_list" && itemIndex + 1 < listNode.childCount;
            const order = Number(listNode.attrs.order ?? 1) + itemIndex + 1;

            return lift(
                state,
                dispatch
                    ? (tr) => { dispatch(continues ? withContinuationOrder(tr, order) : tr); }
                    : undefined,
            );
        },
    });
});
