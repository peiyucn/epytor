/** Top-bar assembly: replaces Crepe's default item groups and snapshots overflow-menu metadata. */
import "./topBar.css";
import type { Ctx } from "@milkdown/kit/ctx";
import { commandsCtx, editorViewCtx } from "@milkdown/kit/core";
import type { EditorState } from "@milkdown/kit/prose/state";
import type { Attrs, Node as ProseNode, NodeType } from "@milkdown/kit/prose/model";
import { undo, redo } from "@milkdown/kit/prose/history";
import { lift, wrapIn } from "prosemirror-commands";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import { wrapInBlockTypeCommand } from "@milkdown/kit/preset/commonmark";
import { insertTableCommand } from "@milkdown/kit/preset/gfm";
import type { TopBarFeatureConfig } from "@milkdown/crepe/feature/top-bar";
import { TbUndo, TbRedo, TbEraser, TbImage, TbToc, TbGear } from "@/ui/icons";
import { findTopBarButtonEl, setTopBarButtonMeta } from "../topBarOverflow";
import { openTableGridPicker } from "../tableGridPicker";

type TopBarBuilder = NonNullable<TopBarFeatureConfig["buildTopBar"]> extends (
    builder: infer B,
) => void
    ? B
    : never;

type BuiltGroup = ReturnType<TopBarBuilder["build"]>[number];
type BuiltItem = BuiltGroup["items"][number];

export function buildTopBarConfig(builder: TopBarBuilder, onTocToggle?: () => void): void {
    // History: its own group, moved to slot 1 once every group exists.
    builder.addGroup('history', '').addItem('undo', {
        icon: TbUndo,
        active: (ctx: Ctx) => undo(ctx.get(editorViewCtx).state),
        onRun: (ctx: Ctx) => { const v = ctx.get(editorViewCtx); undo(v.state, v.dispatch, v); },
    }).addItem('redo', {
        icon: TbRedo,
        active: (ctx: Ctx) => redo(ctx.get(editorViewCtx).state),
        onRun: (ctx: Ctx) => { const v = ctx.get(editorViewCtx); redo(v.state, v.dispatch, v); },
    });
    // Clear formatting goes at the end of the formatting group (after inline code).
    builder.getGroup('formatting').addItem('clear-format', {
        icon: TbEraser,
        active: (ctx) => {
            const v = ctx.get(editorViewCtx);
            const { from, to, empty } = v.state.selection;
            if (!empty) {
                let has = false;
                v.state.doc.nodesBetween(from, to, (n) => { if (n.marks.length) { has = true; return false; } return true; });
                return has;
            }
            // No selection: a link at the caret counts as active.
            const linkType = v.state.schema.marks['link'];
            if (!linkType) return false;
            return linkType.isInSet(v.state.doc.resolve(from).marks()) !== undefined;
        },
        onRun: (ctx) => {
            const v = ctx.get(editorViewCtx);
            let { from, to, empty } = v.state.selection;
            const tr = v.state.tr;
            const linkType = v.state.schema.marks['link'];

            // Caret inside a link: remove the whole link.
            if (empty && linkType) {
                const $from = v.state.doc.resolve(from);
                if (linkType.isInSet($from.marks())) {
                    while (from > 0 && v.state.doc.rangeHasMark(from - 1, from, linkType)) from--;
                    const docSize = v.state.doc.content.size;
                    while (to < docSize && v.state.doc.rangeHasMark(to, to + 1, linkType)) to++;
                    tr.removeMark(from, to, linkType);
                    v.dispatch(tr);
                    return;
                }
            }

            // Selection: grow over the full links first, otherwise removal leaves fragments.
            if (linkType) {
                while (from > 0 && v.state.doc.rangeHasMark(from - 1, from, linkType)) from--;
                const docSize = v.state.doc.content.size;
                while (to < docSize && v.state.doc.rangeHasMark(to, to + 1, linkType)) to++;
            }

            v.state.doc.nodesBetween(from, to, (n, pos) => {
                if (n.marks.length) {
                    const s = Math.max(pos, from), e = Math.min(pos + n.nodeSize, to);
                    n.marks.forEach((m) => tr.removeMark(s, e, m.type));
                }
            });
            if (linkType) tr.removeMark(from, to, linkType);
            v.dispatch(tr);
        },
    });
    // Rebuild the insert group so image sits between link and table.
    {
        const g = builder.getGroup('insert'); const items = g.group.items;
        const linkItem = items.find((i) => i.key === 'link');
        const tableItem = items.find((i) => i.key === 'table');
        g.clear();
        if (linkItem) g.addItem('link', linkItem);
        g.addItem('image', {
            icon: TbImage,
            active: () => false,
            onRun: (ctx) => {
                ctx.get(editorViewCtx).dom.dispatchEvent(new CustomEvent('epytor:insertImage', { bubbles: true }));
            },
        });
        if (tableItem) g.addItem('table', {
            ...tableItem,
            onRun: (ctx) => {
                // Grid picker: hover previews rows × cols; insertTableCommand takes any size.
                const viewDom = ctx.get(editorViewCtx).dom;
                const topBar = viewDom.parentElement?.querySelector<HTMLElement>('.milkdown-top-bar');
                const anchor = (topBar ? findTopBarButtonEl(topBar, 'table') : null) ?? topBar ?? viewDom;
                openTableGridPicker(anchor, (rows, cols) => {
                    ctx.get(commandsCtx).call(insertTableCommand.key, { row: rows, col: cols });
                });
            },
        });
    }
    // Blockquote toggles: lift out when inside, wrap otherwise.
    {
        const isInBlockquote = (state: EditorState) => {
            const bqType = state.schema.nodes['blockquote'];
            if (!bqType) return false;
            const { $from } = state.selection;
            for (let d = $from.depth; d >= 0; d--) {
                if ($from.node(d).type === bqType) return true;
            }
            return false;
        };

        const moreG = builder.getGroup('more');
        const moreItems = moreG.group.items;
        const quoteItem = moreItems.find((i) => i.key === 'quote');
        const hrItem = moreItems.find((i) => i.key === 'hr');
        const quoteIcon = quoteItem?.icon ?? '';
        moreG.clear();
        moreG.addItem('quote', {
            icon: quoteIcon,
            active: (ctx) => isInBlockquote(ctx.get(editorViewCtx).state),
            onRun: (ctx) => {
                const v = ctx.get(editorViewCtx);
                if (isInBlockquote(v.state)) {
                    lift(v.state, v.dispatch);
                } else {
                    const bq = v.state.schema.nodes['blockquote'];
                    if (bq) wrapIn(bq)(v.state, v.dispatch);
                }
            },
        });
        if (hrItem) moreG.addItem('hr', hrItem);
    }
    // List toggle: wrap outside a list, retype the outer list, cancel on the same type.
    {
        const findListItems = (state: EditorState) => {
            const liType = state.schema.nodes['list_item'];
            const { from, to } = state.selection;
            const items: Array<{ pos: number; node: ProseNode }> = [];
            state.doc.nodesBetween(from, to, (node, pos) => {
                if (node.type === liType) items.push({ pos, node });
            });
            if (!items.length) {
                const { $from } = state.selection;
                for (let d = $from.depth; d >= 0; d--) {
                    if ($from.node(d).type === liType) {
                        items.push({ pos: $from.before(d), node: $from.node(d) });
                        break;
                    }
                }
            }
            return items;
        };
        // Top-level list nodes containing those items, deduped.
        const findTopLists = (state: EditorState, items: Array<{ pos: number; node: ProseNode }>) => {
            const lists: Array<{ pos: number; node: ProseNode }> = [];
            const seen = new Set<number>();
            items.forEach(({ pos }) => {
                const $pos = state.doc.resolve(pos);
                for (let d = $pos.depth; d >= 0; d--) {
                    const node = $pos.node(d);
                    if (node.type.name === 'bullet_list' || node.type.name === 'ordered_list') {
                        const listPos = $pos.before(d);
                        if (!seen.has(listPos)) {
                            seen.add(listPos);
                            lists.push({ pos: listPos, node });
                        }
                        break;
                    }
                }
            });
            return lists;
        };
        const listKind = (state: EditorState): 'bullet' | 'ordered' | 'task' | null => {
            const items = findListItems(state);
            if (!items.length) return null;
            const attrs = items[0].node.attrs;
            if (attrs.checked != null) return 'task';
            return attrs.listType === 'ordered' ? 'ordered' : 'bullet';
        };
        const toggleList = (target: 'bullet' | 'ordered' | 'task') => (ctx: Ctx) => {
            const v = ctx.get(editorViewCtx);
            const { state, dispatch } = v;
            const schema = state.schema;
            const kind = listKind(state);
            if (!kind) {
                // Not in a list: wrap.
                let nodeType: NodeType | null = null;
                let attrs: Attrs | null = null;
                if (target === 'bullet') nodeType = schema.nodes['bullet_list'];
                else if (target === 'ordered') nodeType = schema.nodes['ordered_list'];
                else { nodeType = schema.nodes['list_item']; attrs = { checked: false }; }
                if (nodeType) ctx.get(commandsCtx).call(wrapInBlockTypeCommand.key, { nodeType, attrs });
                return;
            }
            if (kind === target) {
                // Same type: cancel (lift one level).
                const liType = schema.nodes['list_item'];
                liftListItem(liType)(state, dispatch);
                return;
            }
            // Different type: retype the outer list and rewrite item attrs.
            // setNodeMarkup keeps node sizes, so the cursor never jumps.
            const items = findListItems(state);
            const lists = findTopLists(state, items);
            if (!lists.length) return;
            const tr = state.tr;
            lists.forEach(({ pos, node }) => {
                const newType = target === 'ordered'
                    ? schema.nodes['ordered_list']
                    : schema.nodes['bullet_list'];
                const newAttrs = { ...node.attrs };
                if (target === 'ordered') newAttrs.order = 1;
                // Retype the wrapper, keeping its content.
                tr.setNodeMarkup(pos, newType, newAttrs);
                // Rewrite each item's attrs.
                let order = 1;
                node.forEach((item: ProseNode, _off: number, itemPos: number) => {
                    const itemAttrs = { ...item.attrs };
                    if (target === 'bullet') {
                        itemAttrs.listType = 'bullet';
                        itemAttrs.label = '•';
                        itemAttrs.checked = null;
                    } else if (target === 'ordered') {
                        itemAttrs.listType = 'ordered';
                        itemAttrs.label = `${order}.`;
                        itemAttrs.checked = null;
                        order++;
                    } else { // task
                        itemAttrs.checked = false;
                        itemAttrs.listType = 'bullet';
                        itemAttrs.label = '•';
                    }
                    tr.setNodeMarkup(pos + itemPos + 1, undefined, itemAttrs);
                });
            });
            dispatch(tr);
        };
        const listG = builder.getGroup('list');
        const listItems = listG.group.items;
        const bulletItem = listItems.find((i) => i.key === 'bullet-list');
        const orderedItem = listItems.find((i) => i.key === 'ordered-list');
        const taskItem = listItems.find((i) => i.key === 'task-list');
        if (bulletItem || orderedItem || taskItem) {
            listG.clear();
            if (bulletItem) listG.addItem('bullet-list', {
                icon: bulletItem.icon,
                active: (ctx: Ctx) => listKind(ctx.get(editorViewCtx).state) === 'bullet',
                onRun: toggleList('bullet'),
            });
            if (orderedItem) listG.addItem('ordered-list', {
                icon: orderedItem.icon,
                active: (ctx: Ctx) => listKind(ctx.get(editorViewCtx).state) === 'ordered',
                onRun: toggleList('ordered'),
            });
            if (taskItem) listG.addItem('task-list', {
                icon: taskItem.icon,
                active: (ctx: Ctx) => listKind(ctx.get(editorViewCtx).state) === 'task',
                onRun: toggleList('task'),
            });
        }
    }
    // TOC toggle: its own group.
    builder.addGroup('toc', '').addItem('toc', {
        icon: TbToc,
        active: () => false,
        onRun: () => {
            onTocToggle?.();
        },
    });
    // Settings: its own group, always in the overflow menu.
    builder.addGroup('settings', '').addItem('settings', {
        icon: TbGear,
        active: () => false,
        onRun: () => {
            document.dispatchEvent(new CustomEvent('epytor:openSettings', { bubbles: true }));
        },
    });
    // Order: toc, history, then the rest.
    const groups = builder.build();
    const tocGroup = groups.find((g) => g.key === 'toc');
    if (tocGroup) {
        const idx = groups.indexOf(tocGroup);
        groups.splice(idx, 1);
        groups.unshift(tocGroup);
    }
    const historyGroup = groups.find((g) => g.key === 'history');
    if (historyGroup) {
        const idx = groups.indexOf(historyGroup);
        groups.splice(idx, 1);
        groups.splice(1, 0, historyGroup);
    }
    // Snapshot key/icon/onRun in DOM order for the overflow panel.
    setTopBarButtonMeta(
        groups.flatMap((g: BuiltGroup) =>
            g.items.map((item: BuiltItem) => ({
                key: item.key,
                icon: (item.icon as string) ?? "",
                onRun: item.onRun ?? (() => undefined),
            })),
        ),
    );
}
