import { $prose } from "@milkdown/kit/utils";
import { schemaCtx } from "@milkdown/kit/core";
import { keymap } from "@milkdown/kit/prose/keymap";
import { Fragment, type Node, type NodeType, type ResolvedPos } from "@milkdown/kit/prose/model";
import { Plugin, TextSelection, type EditorState, type Transaction } from "@milkdown/kit/prose/state";
import { canJoin } from "@milkdown/kit/prose/transform";
import { liftListItem } from "@milkdown/kit/prose/schema-list";




function listItemDepth($from: ResolvedPos, listItem: NodeType): number {
    for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === listItem) { return depth; }
    }
    return -1;
}


function isNestedList($from: ResolvedPos, listDepth: number, listItem: NodeType): boolean {
    return listDepth >= 1 && $from.node(listDepth - 1).type === listItem;
}


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


function mergeAdjacentTopLevelLists(tr: Transaction): void {
    const positions: number[] = [];
    tr.doc.forEach((node, offset) => {
        if (node.type.name === "bullet_list" || node.type.name === "ordered_list") {
            positions.push(offset);
        }
    });

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


    const remaining: Node[] = [];
    parentList.forEach((child, _offset, index) => {
        if (index !== itemIndex) { remaining.push(child); }
    });
    const newParentList = remaining.length > 0
        ? parentList.copy(Fragment.fromArray(remaining))
        : null;


    const parentChildren: Node[] = [];
    parentItem.forEach((child, _offset, index) => {
        if (index === parentListIndex) {
            if (newParentList) { parentChildren.push(newParentList); }
        } else {
            parentChildren.push(child);
        }
    });
    const newParentItem = parentItem.copy(Fragment.fromArray(parentChildren));


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



    let liftedItemPos = grandListPos + 1;
    for (let index = 0; index < parentItemIndex; index++) {
        liftedItemPos += grandList.child(index).nodeSize;
    }
    liftedItemPos += newParentItem.nodeSize;
    const caret = liftedItemPos + 2;
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

            if ($from.index(itemDepth) !== 0) { return false; }


            if (isNestedList($from, itemDepth - 1, listItem)) {


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
