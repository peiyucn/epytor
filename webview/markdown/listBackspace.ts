import { $prose } from "@milkdown/kit/utils";
import { schemaCtx } from "@milkdown/kit/core";
import { keymap } from "@milkdown/kit/prose/keymap";
import { Fragment, type Node, type NodeType, type ResolvedPos } from "@milkdown/kit/prose/model";
import { Plugin, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { canJoin } from "@milkdown/kit/prose/transform";
import { liftListItem } from "@milkdown/kit/prose/schema-list";

/**
 * Backspace at the start of a list item.
 *
 * Top-level items become plain paragraphs; nested items move up one level. Nested items are
 * handled manually because ProseMirror's `liftListItem` pulls the following siblings into
 * the lifted item, which changes the level of every item below it. Empty nested items are
 * removed instead of being promoted; adjacent top-level lists are merged so the Markdown
 * round-trip keeps the same structure, and ordered-list continuations keep their number.
 */

/** Depth of the enclosing list_item, or -1. */
function listItemDepth($from: ResolvedPos, listItem: NodeType): number {
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === listItem) { return depth; }
    }
    return -1;
}

/** True when the list at `depth` is itself inside a list item (i.e. a nested list). */
function isNestedList($from: ResolvedPos, listDepth: number, listItem: NodeType): boolean {
    return listDepth >= 1 && $from.node(listDepth - 1).type === listItem;
}

/**
 * After lifting a top-level item, set the continuation ordered list's start number if the
 * split created one. Position is read from the lifted paragraph's next sibling.
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

/**
 * Merge adjacent top-level lists of the same type. Lifting a top-level item with a nested
 * list can leave two lists next to each other; the serializer separates them with a blank
 * line, which Markdown reopens as one loose list.
 */
function mergeAdjacentTopLevelLists(tr: Transaction): void {
    const positions: number[] = [];
    tr.doc.forEach((node, offset) => {
        if (node.type.name === "bullet_list" || node.type.name === "ordered_list") {
            positions.push(offset);
        }
    });
    // Join from the end so earlier positions stay valid.
    for (let i = positions.length - 2; i >= 0; i--) {
        const pos = positions[i];
        const left = tr.doc.nodeAt(pos);
        if (!left) { continue; }
        const rightPos = pos + left.nodeSize;
        const right = tr.doc.nodeAt(rightPos);
        if (right && left.type === right.type && canJoin(tr.doc, rightPos)) {
            tr.join(rightPos);
        }
    }
}

/**
 * Delete an empty nested item instead of promoting it one level. An item with no content
 * and no children has nothing to lift; repeated Backspace would otherwise walk it up to the
 * top level. The parent list is removed too when this was its only child.
 */
function deleteEmptyNestedItem(
    state: EditorState,
    $from: ResolvedPos,
    itemDepth: number,
): Transaction | null {
    const item = $from.node(itemDepth);
    if (item.childCount !== 1) { return null; }
    const paragraph = item.firstChild;
    if (!paragraph || paragraph.type.name !== "paragraph" || paragraph.content.size !== 0) {
        return null;
    }

    const parentListDepth = itemDepth - 1;
    const parentList = $from.node(parentListDepth);
    const parentListPos = $from.before(parentListDepth);
    const itemPos = $from.before(itemDepth);

    if (parentList.childCount === 1) {
        const tr = state.tr.delete(parentListPos, parentListPos + parentList.nodeSize);
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(parentListPos, tr.doc.content.size)), -1));
        return tr;
    }

    const tr = state.tr.delete(itemPos, itemPos + item.nodeSize);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(itemPos - 1, tr.doc.content.size)), -1));
    return tr;
}

/**
 * Move a nested list item up one level without dragging its following siblings into it.
 *
 * Before:  parentItem > parentList [.., item, following..]
 * After:   parentItem > parentList [..] ; grandList [.., parentItem, item, following..]
 *
 * `item` keeps its own child list. `following` stays in `parentList`; when the item is
 * the first child that list simply loses its head, when it is in the middle the list
 * keeps its remaining items.
 */
function liftNestedItem(state: EditorState, $from: ResolvedPos, itemDepth: number): Transaction | null {
    const parentListDepth = itemDepth - 1;
    const parentItemDepth = itemDepth - 2;
    const grandListDepth = itemDepth - 3;
    if (parentListDepth < 1 || parentItemDepth < 1 || grandListDepth < 1) { return null; }

    const parentList = $from.node(parentListDepth);
    const item = $from.node(itemDepth);
    const parentItem = $from.node(parentItemDepth);
    const grandList = $from.node(grandListDepth);

    const itemIndex = $from.index(parentListDepth);
    const parentListIndex = $from.index(parentItemDepth);
    const parentItemIndex = $from.index(grandListDepth);

    // The original parent list keeps every child except the lifted item.
    const remaining: Node[] = [];
    parentList.forEach((child, _offset, index) => {
        if (index !== itemIndex) { remaining.push(child); }
    });
    const newParentList = remaining.length > 0
        ? parentList.copy(Fragment.fromArray(remaining))
        : null;

    // Rebuild the parent item with the reduced (or removed) child list.
    const parentChildren: Node[] = [];
    parentItem.forEach((child, _offset, index) => {
        if (index === parentListIndex) {
            if (newParentList) { parentChildren.push(newParentList); }
        } else {
            parentChildren.push(child);
        }
    });
    const newParentItem = parentItem.copy(Fragment.fromArray(parentChildren));

    // Rebuild the grand list: parent item stays in place, lifted item follows it.
    const grandChildren: Node[] = [];
    grandList.forEach((child, _offset, index) => {
        if (index === parentItemIndex) {
            grandChildren.push(newParentItem, item);
        } else {
            grandChildren.push(child);
        }
    });
    const newGrandList = grandList.copy(Fragment.fromArray(grandChildren));

    const grandListPos = $from.before(grandListDepth);
    const tr = state.tr.replaceWith(grandListPos, grandListPos + grandList.nodeSize, newGrandList);

    // Place the caret at the start of the lifted item's first paragraph. The item is a
    // direct child of the rebuilt grand list, so the position is computed from node sizes.
    let liftedItemPos = grandListPos + 1;
    for (let index = 0; index < parentItemIndex; index++) {
        liftedItemPos += grandList.child(index).nodeSize;
    }
    liftedItemPos += newParentItem.nodeSize;
    const caret = liftedItemPos + 2; // list_item → paragraph → text start
    tr.setSelection(TextSelection.create(tr.doc, caret));
    return tr;
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

            // Nested item: custom lift (see file header); keeps the following siblings in place.
            if (isNestedList($from, itemDepth - 1, listItem)) {
                // An empty item has no content to lift; Backspace should remove it rather than
                // walk an empty row up to the top level.
                const empty = deleteEmptyNestedItem(state, $from, itemDepth);
                if (empty) {
                    if (dispatch) { dispatch(empty.scrollIntoView()); }
                    return true;
                }
                const tr = liftNestedItem(state, $from, itemDepth);
                if (!tr) { return false; }
                if (dispatch) { dispatch(tr.scrollIntoView()); }
                return true;
            }

            const listNode = $from.node(itemDepth - 1);
            const itemIndex = $from.index(itemDepth - 1);
            const continues = listNode.type.name === "ordered_list" && itemIndex + 1 < listNode.childCount;
            const order = Number(listNode.attrs.order ?? 1) + itemIndex + 1;

            return lift(
                state,
                dispatch
                    ? (tr) => {
                        const next = continues ? withContinuationOrder(tr, order) : tr;
                        mergeAdjacentTopLevelLists(next);
                        dispatch(next);
                    }
                    : undefined,
            );
        },
    });
});
