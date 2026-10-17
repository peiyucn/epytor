/**
 * 任务项回车新建项未勾选（回归：owner 手测 2026-10-16）。
 *
 * 现象：`- [x] 已完成` 里回车，新出现的项也是勾选态。
 * 根因：官方 `splitListItem(listItem)`（commonmark preset 把回车绑到它）分裂时原样复制
 * 被分裂节点的 attrs，任务项的 `checked` 因此被带进新项；官方 `splitListItem(itemType, itemAttrs)`
 * 的 `itemAttrs` 只在「光标在项末尾」分支生效。实现见 `webview/utils/taskListItemEnter.ts`。
 *
 * 本文件锁定**修复后语义**：回车新建的项一律未勾选，原项保持原状；未勾选任务项与
 * 普通列表项不受影响。
 */
import { afterEach, describe, expect, it } from "vitest";
import { CrepeBuilder } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { taskListItemEnterPlugin } from "../utils/taskListItemEnter";

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() { /* noop */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() { /* noop */ }, removeListener() { /* noop */ },
        addEventListener() { /* noop */ }, removeEventListener() { /* noop */ },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}

async function makeEditor(md: string) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const crepe = new CrepeBuilder({ root, defaultValue: md });
    crepe.editor.use(taskListItemEnterPlugin);
    return crepe.create();
}

type Editor = Awaited<ReturnType<typeof makeEditor>>;
const getView = (editor: Editor): EditorView => editor.action((ctx) => ctx.get(editorViewCtx));
const serialize = (editor: Editor): string => editor.action(getMarkdown());

function pressEnter(view: EditorView): boolean {
    let handled = false;
    const event = {
        key: "Enter",
        preventDefault() { /* noop */ },
        stopPropagation() { /* noop */ },
    } as unknown as KeyboardEvent;
    view.someProp("handleKeyDown", (f) => {
        if (f(view, event)) { handled = true; return true; }
        return false;
    });
    return handled;
}

/** 全部 list_item 的 `checked`（文档顺序）：true / false = 任务项，null = 普通列表项 */
function checkedFlags(view: EditorView): Array<boolean | null> {
    const out: Array<boolean | null> = [];
    view.state.doc.descendants((node) => {
        if (node.type.name === "list_item") { out.push(node.attrs.checked as boolean | null); }
    });
    return out;
}

/** 每个 list_item 首块（段落）的文本 */
function itemTexts(view: EditorView): string[] {
    const out: string[] = [];
    view.state.doc.descendants((node) => {
        if (node.type.name === "list_item") { out.push(node.firstChild?.textContent ?? ""); }
    });
    return out;
}

/** 项内文本起点在文档里的位置（item 位置 + 1 段 + 1 文本） */
function textStart(view: EditorView, itemIndex: number): number {
    const positions: number[] = [];
    view.state.doc.descendants((node, pos) => {
        if (node.type.name === "list_item") { positions.push(pos); }
    });
    return positions[itemIndex] + 2;
}

function setCursor(view: EditorView, pos: number): void {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

afterEach(() => { document.body.innerHTML = ""; });

describe("任务项回车：新建项一律未勾选", () => {
    it("已勾选任务项末尾回车 应该 原项仍勾选、新项未勾选", async () => {
        const editor = await makeEditor("- [x] done\n");
        const view = getView(editor);
        setCursor(view, textStart(view, 0) + "done".length);

        expect(pressEnter(view)).toBe(true);

        expect(itemTexts(view)).toEqual(["done", ""]);
        expect(checkedFlags(view)).toEqual([true, false]);
        // 存盘同样保持「原项勾选、新项空复选框」（标记符与空项 `<br />` 占位是序列化层的另一条路径，
        // 本用例只锁复选框标记）
        const md = serialize(editor);
        expect(md).toContain("[x] done");
        expect(md).toContain("[ ]");
    });

    it("已勾选任务项中间回车 应该 文本按光标切分且新项未勾选", async () => {
        const editor = await makeEditor("- [x] abcdef\n");
        const view = getView(editor);
        setCursor(view, textStart(view, 0) + 3);

        expect(pressEnter(view)).toBe(true);

        expect(itemTexts(view)).toEqual(["abc", "def"]);
        expect(checkedFlags(view)).toEqual([true, false]);
    });

    it("已勾选任务项后续项 应该 也保持原状（只动新建的那一项）", async () => {
        const editor = await makeEditor("- [x] a\n- [x] b\n");
        const view = getView(editor);
        setCursor(view, textStart(view, 0) + 1);

        expect(pressEnter(view)).toBe(true);

        expect(itemTexts(view)).toEqual(["a", "", "b"]);
        expect(checkedFlags(view)).toEqual([true, false, true]);
    });

    it("未勾选任务项回车 应该 两项都未勾选（默认行为不回归）", async () => {
        const editor = await makeEditor("- [ ] todo\n");
        const view = getView(editor);
        setCursor(view, textStart(view, 0) + "todo".length);

        expect(pressEnter(view)).toBe(true);

        expect(itemTexts(view)).toEqual(["todo", ""]);
        expect(checkedFlags(view)).toEqual([false, false]);
    });

    it("嵌套已勾选任务项回车 应该 同级新项未勾选、外层项不动", async () => {
        const editor = await makeEditor("- [ ] outer\n  - [x] inner\n");
        const view = getView(editor);
        setCursor(view, textStart(view, 1) + "inner".length);

        expect(pressEnter(view)).toBe(true);

        expect(itemTexts(view)).toEqual(["outer", "inner", ""]);
        expect(checkedFlags(view)).toEqual([false, true, false]);
    });

    it("普通列表项回车 应该 不产生任务复选框（本插件不接管）", async () => {
        const editor = await makeEditor("- a\n");
        const view = getView(editor);
        setCursor(view, textStart(view, 0) + 1);

        expect(pressEnter(view)).toBe(true);

        expect(itemTexts(view)).toEqual(["a", ""]);
        expect(checkedFlags(view)).toEqual([null, null]);
    });
});
