import { schemaCtx } from "@milkdown/kit/core";
import { keymap } from "@milkdown/kit/prose/keymap";
import type { Attrs } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import { splitListItem } from "@milkdown/kit/prose/schema-list";
import { canSplit } from "@milkdown/kit/prose/transform";
import { $prose } from "@milkdown/kit/utils";

/**
 * 任务项里回车新建的项：**一律未勾选**（回归：owner 手测 2026-10-16）。
 *
 * 现象：已勾选的任务项（`- [x] 已完成`）里按回车，新出现的项也是勾选态——
 * 用户预期「新出现的默认都该是未勾选」。
 *
 * 根因在下游官方命令 `splitListItem(listItem)`（commonmark preset 的 `listItemKeymap`
 * 把回车绑到它）：它分裂节点时**原样复制被分裂节点的 attrs**，
 * `prosemirror-schema-list@1.5.1` 的 `splitListItem` 里两处都如此——
 *   * 普通分支（光标在项末尾、`$to.pos == $from.end()`）：`types` 由 `itemAttrs` 决定，
 *     而官方命令**不传** `itemAttrs`，于是新项走「复制」路径；
 *   * 中途分支（`nextType == null`）：`types = undefined`，无论 `itemAttrs` 传不传都是复制。
 * 任务项的 `checked` 就在被复制的 attrs 里，于是完成态被带进新项。
 *
 * 官方 API 的 `splitListItem(itemType, itemAttrs)` 第二参数正是「新项的 attrs」，
 * 但它只作用于普通分支。所以：
 *   * 光标在项末尾 → 交给官方 `splitListItem(listItem, {...原 attrs, checked: false})`；
 *   * 光标在项中间 → 按同一套 `typesAfter` 语义显式构造（`canSplit` + `tr.split`，
 *     与官方命令同源的原语），`typesAfter` 自浅向深、末位作用于最深节点。
 *
 * 只接管「已勾选」（`checked === true`）的项：`false` 复制过去仍是未勾选、`null`
 * （非任务项）复制过去仍是非任务项——结果本就正确，一律交回默认键位，
 * 不做无谓的行为改写。空文本块位于项末尾时上游不分裂（走嵌套上提 / 退出列表），
 * 也不会产生新任务项，同样交回默认。
 */

export const taskListItemEnterPlugin = $prose((ctx) => {
    const listItem = ctx.get(schemaCtx).nodes["list_item"];
    if (!listItem) { return new Plugin({}); }

    return keymap({
        Enter: (state, dispatch) => {
            const { $from, $to } = state.selection;
            if ($from.depth < 2 || !$from.sameParent($to)) { return false; }

            const item = $from.node(-1);
            if (item.type !== listItem || item.attrs.checked !== true) { return false; }
            // 项内末尾的空文本块（`$from.parent.content.size == 0` 且已是最后一块）
            if ($from.parent.content.size === 0 && item.childCount === $from.indexAfter(-1)) { return false; }

            const attrs: Attrs = { ...item.attrs, checked: false };

            // 光标在项末尾：官方 API 的 itemAttrs 就是「新项的 attrs」
            if ($to.pos === $from.end()) {
                return splitListItem(listItem, attrs)(state, dispatch);
            }

            // 光标在项中间：官方命令这条分支固定复制原 attrs（见文件头），故显式构造
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
