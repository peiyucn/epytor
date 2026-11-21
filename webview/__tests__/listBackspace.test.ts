
import { afterEach, describe, expect, it } from "vitest";
import { CrepeBuilder } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { listBackspacePlugin } from "../markdown/listBackspace";

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {  }
        unobserve() {  }
        disconnect() {  }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() {  }, removeListener() {  },
        addEventListener() {  }, removeEventListener() {  },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}

async function makeEditor(md: string) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const crepe = new CrepeBuilder({ root, defaultValue: md });
    crepe.editor.use(listBackspacePlugin);
    return crepe.create();
}

type Editor = Awaited<ReturnType<typeof makeEditor>>;
const getView = (editor: Editor): EditorView => editor.action((ctx) => ctx.get(editorViewCtx));
const serialize = (editor: Editor): string => editor.action(getMarkdown());

const serializeNormalized = (editor: Editor): string =>
    serialize(editor).trim().replace(/^(\s*)\* /gm, "$1- ");

function pressBackspace(view: EditorView): boolean {
    let handled = false;
    const event = {
        key: "Backspace",
        preventDefault() {  },
        stopPropagation() {  },
    } as unknown as KeyboardEvent;
    view.someProp("handleKeyDown", (f) => {
        if (f(view, event)) { handled = true; return true; }
        return false;
    });
    return handled;
}

function topLevelOutline(view: EditorView): string[] {
    const out: string[] = [];
    view.state.doc.forEach((node, _offset, index) => {
        void index;
        if (node.type.name === "paragraph") { out.push(`p:${node.textContent}`); return; }
        if (node.type.name.endsWith("list")) {
            const items: string[] = [];
            node.forEach((item) => {
                const blocks: string[] = [];
                item.forEach((child) => {
                    blocks.push(child.type.name === "paragraph" ? child.textContent : `<${child.type.name}>`);
                });
                items.push(`${String(item.attrs.label)}${blocks.join("+")}`);
            });
            out.push(`${node.type.name === "ordered_list" ? "ol" : "ul"}[${items.join(", ")}]`);
            return;
        }
        out.push(node.type.name);
    });
    if (out.length > 1 && out[out.length - 1] === "p:") { out.pop(); }
    return out;
}

function itemPositions(view: EditorView): number[] {
    const positions: number[] = [];
    view.state.doc.descendants((node, pos) => {
        if (node.type.name === "list_item") { positions.push(pos); }
    });
    return positions;
}

function setCursor(view: EditorView, pos: number): void {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

const cursorText = (view: EditorView): string => view.state.selection.$from.parent.textContent;
const cursorInTextblock = (view: EditorView): boolean => view.state.selection.$from.parent.isTextblock;

afterEach(() => { document.body.innerHTML = ""; });

describe("列表项行首 Backspace：断开列表变成普通行", () => {
    it("无序列表中间项 应该 升为普通行并断开列表，不留空段落", async () => {
        const editor = await makeEditor("- a\n- b\n- c\n");
        const view = getView(editor);
        setCursor(view, itemPositions(view)[1] + 1);
        expect(pressBackspace(view)).toBe(true);

        expect(topLevelOutline(view)).toEqual(["ul[•a]", "p:b", "ul[•c]"]);

        expect(cursorText(view)).toBe("b");
        expect(cursorInTextblock(view)).toBe(true);
    });

    it("无序列表空项 应该 升为普通空行并断开列表", async () => {
        const editor = await makeEditor("- a\n- \n- c\n");
        const view = getView(editor);
        setCursor(view, itemPositions(view)[1] + 1);
        expect(pressBackspace(view)).toBe(true);

        expect(topLevelOutline(view)).toEqual(["ul[•a]", "p:", "ul[•c]"]);
        expect(cursorText(view)).toBe("");
        expect(cursorInTextblock(view)).toBe(true);
    });

    it("有序列表中间项 应该 断开列表、且后半段延续编号（不是从 1 重来）", async () => {
        const editor = await makeEditor("1. a\n2. b\n3. c\n");
        const view = getView(editor);
        setCursor(view, itemPositions(view)[1] + 1);
        expect(pressBackspace(view)).toBe(true);

        expect(topLevelOutline(view)).toEqual(["ol[1.a]", "p:b", "ol[3.c]"]);

        expect(serialize(editor)).toContain("3. c");
        expect(serialize(editor)).not.toContain("1. c");
    });

    it("列表第一项 应该 升为普通行，列表整体下移", async () => {
        const editor = await makeEditor("- a\n- b\n");
        const view = getView(editor);
        setCursor(view, itemPositions(view)[0] + 1);
        expect(pressBackspace(view)).toBe(true);

        expect(topLevelOutline(view)).toEqual(["p:a", "ul[•b]"]);
    });

    it("嵌套项 应该 上升一级（回到外层列表），不整段飞出", async () => {
        const editor = await makeEditor("- a\n  - b\n  - \n- c\n");
        const view = getView(editor);
        setCursor(view, itemPositions(view)[2] + 1);
        expect(pressBackspace(view)).toBe(true);

        expect(cursorInTextblock(view)).toBe(true);
    });

    it("嵌套任务列表第一项退格 应该 只提升本项，后面的子项留在原父项下", async () => {

        const editor = await makeEditor("- [ ] 第一项\n- [ ] 第二项\n  - [ ] 子项 A\n  - [ ] 子项 B\n- [ ] 第三项\n");
        const view = getView(editor);
        setCursor(view, itemPositions(view)[2] + 1);
        expect(pressBackspace(view)).toBe(true);

        const expected = "- [ ] 第一项\n- [ ] 第二项\n  - [ ] 子项 B\n- [ ] 子项 A\n- [ ] 第三项";
        expect(serializeNormalized(editor)).toBe(expected);
        const reopened = await makeEditor(serialize(editor));
        expect(serializeNormalized(reopened)).toBe(expected);
    });

    it("嵌套任务列表中间项退格 应该 保留父项里前后兄弟的层级", async () => {
        const editor = await makeEditor("- [ ] 一\n- [ ] 二\n  - [ ] 2.1\n  - [ ] 2.2\n  - [ ] 2.3\n- [ ] 三\n");
        const view = getView(editor);
        setCursor(view, itemPositions(view)[3] + 1);
        expect(pressBackspace(view)).toBe(true);

        const expected = "- [ ] 一\n- [ ] 二\n  - [ ] 2.1\n  - [ ] 2.3\n- [ ] 2.2\n- [ ] 三";
        expect(serializeNormalized(editor)).toBe(expected);
        const reopened = await makeEditor(serialize(editor));
        expect(serializeNormalized(reopened)).toBe(expected);
    });

    it("深层嵌套任务项退格 应该 保留自己的子项、不吞掉下面的兄弟", async () => {
        const editor = await makeEditor("- [ ] 一\n- [ ] 二\n  - [ ] 2.1\n    - [ ] 2.1.1\n  - [ ] 2.2\n- [ ] 三\n");
        const view = getView(editor);
        setCursor(view, itemPositions(view)[2] + 1);
        expect(pressBackspace(view)).toBe(true);

        const expected = "- [ ] 一\n- [ ] 二\n  - [ ] 2.2\n- [ ] 2.1\n  - [ ] 2.1.1\n- [ ] 三";
        expect(serializeNormalized(editor)).toBe(expected);
        const reopened = await makeEditor(serialize(editor));
        expect(serializeNormalized(reopened)).toBe(expected);
    });

    it("顶层任务项退格 应该 把其子项与后面的列表合成一个列表（重开结构不变）", async () => {
        const editor = await makeEditor("- [ ] 第一项\n- [ ] 第二项\n  - [ ] 子项 A\n  - [ ] 子项 B\n- [ ] 第三项\n");
        const view = getView(editor);
        setCursor(view, itemPositions(view)[1] + 1);
        expect(pressBackspace(view)).toBe(true);

        const saved = serializeNormalized(editor);
        const reopened = await makeEditor(saved + "\n");
        const reopenedView = getView(reopened);
        expect(topLevelOutline(reopenedView)).toEqual(["ul[•第一项]", "p:第二项", "ul[•子项 A, •子项 B, •第三项]"]);
        expect(serializeNormalized(reopened)).toBe(saved);
    });

    it("嵌套项下面还有同级项时退格 应该 只提升被按项，同级项保持原层（2026-11-01 手测结构）", async () => {
        const editor = await makeEditor(
            "* [ ] 嵌套任务列表中间某项退格\n  * [ ] 212313\n  * [ ] 1231\n    * [ ] 213131\n  * [ ] 123131312\n",
        );
        const view = getView(editor);
        setCursor(view, itemPositions(view)[3] + 1);
        expect(pressBackspace(view)).toBe(true);

        const expected = "- [ ] 嵌套任务列表中间某项退格\n  - [ ] 212313\n  - [ ] 1231\n  - [ ] 213131\n  - [ ] 123131312";
        expect(serializeNormalized(editor)).toBe(expected);
        const reopened = await makeEditor(serialize(editor));
        expect(serializeNormalized(reopened)).toBe(expected);
    });

    it("嵌套空任务项退格 应该 直接删除空项，而不是把它逐级提到顶级", async () => {

        const editor = await makeEditor("- [ ] parent\n  - [ ] 1\n  - [ ] 4\n  - [ ] 2\n");
        const view = getView(editor);
        let fourFrom = 0;
        view.state.doc.descendants((node, pos) => {
            if (node.isText && node.text === "4") { fourFrom = pos; }
        });
        view.dispatch(view.state.tr.delete(fourFrom, fourFrom + 1));
        const emptyPositions = itemPositions(view).filter((pos) => view.state.doc.nodeAt(pos)?.textContent === "");
        expect(emptyPositions).toHaveLength(1);
        setCursor(view, emptyPositions[0] + 2);
        expect(pressBackspace(view)).toBe(true);

        const expected = "- [ ] parent\n  - [ ] 1\n  - [ ] 2";
        expect(serializeNormalized(editor)).toBe(expected);
        const reopened = await makeEditor(serialize(editor));
        expect(serializeNormalized(reopened)).toBe(expected);
    });

    it("非行首退格 不应该 改变列表结构（字符删除由浏览器原生处理）", async () => {
        const editor = await makeEditor("- ab\n- c\n");
        const view = getView(editor);

        setCursor(view, itemPositions(view)[0] + 3);
        pressBackspace(view);

        expect(topLevelOutline(view)).toEqual(["ul[•ab, •c]"]);
    });
});
