import { schemaCtx } from "@milkdown/kit/core";
import { keymap } from "@milkdown/kit/prose/keymap";
import type { Attrs } from "@milkdown/kit/prose/model";
import { Plugin } from "@milkdown/kit/prose/state";
import { liftListItem, splitListItem } from "@milkdown/kit/prose/schema-list";
import { canSplit } from "@milkdown/kit/prose/transform";
import { $prose } from "@milkdown/kit/utils";

/**
 * 任务项里的回车：新建项**一律未勾选**（回归：owner 手测 2026-10-16）；
 * 空项回车**提升一级**、不产生普通圆点项（回归：owner 手测 2026-10-18）。
 *
 * 现象 1（2026-10-16）：已勾选的任务项（`- [x] 已完成`）里按回车，新出现的项也是勾选态。
 * 现象 2（2026-10-18）：任务项**连续回车**，空任务项会先变成圆点项、再按一次才退出列表；
 *   仅**嵌套任务列表**可见（顶层空项不会）。
 *
 * 根因都在下游官方命令 `splitListItem(listItem)`（commonmark preset 的 `listItemKeymap`
 * 把回车绑到它）：
 *   * 普通分支（光标在项末尾、`$to.pos == $from.end()`）：`types` 由 `itemAttrs` 决定，
 *     而官方命令**不传** `itemAttrs`，于是新项原样「复制」被分裂节点的 attrs；
 *   * 中途分支（`nextType == null`）：`types = undefined`，无论 `itemAttrs` 传不传都是复制；
 *   * **空项分支**（项内末尾的空段落）：用 `itemType.createAndFill()` 造新项 → attrs 取
 *     schema 默认值，`checked` 回到 `null`，任务项因此变成普通圆点项。顶层空项会因为
 *     `$from.depth == 3` 让这条分支 `return false`（改走 `liftEmptyBlock`，恰好正确），
 *     所以现象 2 只在嵌套任务列表里出现。
 *
 * 官方 API 的 `splitListItem(itemType, itemAttrs)` 第二参数只作用于普通分支。所以：
 *   * 空项 → `liftListItem`：把该项提升一级（顶层即退出列表），沿用它的 attrs，不造圆点项；
 *   * 光标在项末尾 → 官方 `splitListItem(listItem, {...原 attrs, checked: false})`；
 *   * 光标在项中间 → 按同一套 `typesAfter` 语义显式构造（`canSplit` + `tr.split`，
 *     与官方命令同源的原语），`typesAfter` 自浅向深、末位作用于最深节点。
 *
 * 非空且**未勾选**的项交回默认键位：复制过去仍是未勾选，结果本就正确，不做无谓改写；
 * 非任务项（`checked === null`）一律不接管。
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

            // 空任务项（项内末尾的空段落）：回车 = 提升一级（顶层即退出列表）。
            // 不能交回上游空项分支——它用 createAndFill() 造出 checked:null 的圆点项
            if ($from.parent.content.size === 0 && item.childCount === $from.indexAfter(-1)) {
                return lift(state, dispatch);
            }

            // 非空：只接管「已勾选」的项（未勾选的默认分支原样复制 attrs，结果本就正确）
            if (checked !== true) { return false; }

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
