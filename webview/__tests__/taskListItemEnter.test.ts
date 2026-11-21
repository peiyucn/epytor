
import { afterEach, describe, expect, it } from "vitest";
import { CrepeBuilder } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { taskListItemEnterPlugin } from "../markdown/taskListItemEnter";

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
        preventDefault() {  },
        stopPropagation() {  },
    } as unknown as KeyboardEvent;
    view.someProp("handleKeyDown", (f) => {
        if (f(view, event)) { handled = true; return true; }
        return false;
    });
    return handled;
}


function checkedFlags(view: EditorView): Array<boolean | null> {
    const out: Array<boolean | null> = [];
    view.state.doc.descendants((node) => {
        if (node.type.name === "list_item") { out.push(node.attrs.checked as boolean | null); }
    });
    return out;
}


function itemTexts(view: EditorView): string[] {
    const out: string[] = [];
    view.state.doc.descendants((node) => {
        if (node.type.name === "list_item") { out.push(node.firstChild?.textContent ?? ""); }
    });
    return out;
}


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

    it("嵌套任务列表：内层空项回车 应该 提升一级、不产生圆点项", async () => {



        const editor = await makeEditor("- [ ] outer\n  - [ ] inner\n");
        const view = getView(editor);
        setCursor(view, textStart(view, 1) + "inner".length);

        expect(pressEnter(view)).toBe(true);
        expect(checkedFlags(view)).toEqual([false, false, false]);

        expect(pressEnter(view)).toBe(true);
        expect(checkedFlags(view).every((checked) => checked === false)).toBe(true);
        expect(itemTexts(view)).toEqual(["outer", "inner", ""]);

        expect(view.state.doc.firstChild?.type.name).toBe("bullet_list");
        expect(view.state.doc.firstChild?.childCount).toBe(2);
    });

    it("顶层空任务项回车 应该 退出列表（行为不变）", async () => {
        const editor = await makeEditor("- [ ] todo\n");
        const view = getView(editor);
        setCursor(view, textStart(view, 0) + "todo".length);

        expect(pressEnter(view)).toBe(true);
        expect(checkedFlags(view)).toEqual([false, false]);

        expect(pressEnter(view)).toBe(true);

        const topKinds: string[] = [];
        view.state.doc.forEach((node) => { topKinds.push(node.type.name); });
        expect(topKinds[0]).toBe("bullet_list");
        expect(topKinds).toContain("paragraph");
        expect(checkedFlags(view)).toEqual([false]);
    });

    it("嵌套任务项连续回车 应该 全程不出现 checked=null 的圆点项", async () => {
        const editor = await makeEditor("- [x] a\n  - [ ] b\n");
        const view = getView(editor);
        setCursor(view, textStart(view, 1) + 1);

        for (let i = 0; i < 3; i++) {
            pressEnter(view);
            expect(checkedFlags(view).every((checked) => typeof checked === "boolean")).toBe(true);
        }
    });
});
