
import { afterEach, describe, expect, it } from "vitest";
import { CrepeBuilder } from "@milkdown/crepe";
import { editorViewCtx, remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { getMarkdown } from "@milkdown/kit/utils";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { softBreakKeymap } from "../editor/plugins/softBreakKeymap";
import { withTableBreakHandler } from "../markdown/markdownSerializer";

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
    crepe.editor.config((ctx) => {
        ctx.update(remarkStringifyOptionsCtx, (options) => withTableBreakHandler(options));
    });
    crepe.editor.use(softBreakKeymap);
    const editor = await crepe.create();
    return editor;
}

function getView(editor: Awaited<ReturnType<typeof makeEditor>>): EditorView {
    return editor.action((ctx) => ctx.get(editorViewCtx));
}

function setCursor(view: EditorView, pos: number): void {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));
}

function pressShiftEnter(view: EditorView): boolean {
    let handled = false;
    const event = {
        key: "Enter",
        shiftKey: true,
        preventDefault() {  },
        stopPropagation() {  },
    } as unknown as KeyboardEvent;
    view.someProp("handleKeyDown", (f) => {
        if (f(view, event)) { handled = true; return true; }
        return false;
    });
    return handled;
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("表格软换行（softBreakKeymap）", () => {
    it("单元格内 Shift+Enter 应该 插入换行并序列化为 <br>", async () => {
        const editor = await makeEditor("| A | B |\n| --- | --- |\n| x | y |\n");
        const view = getView(editor);

        let cellPos = -1;
        view.state.doc.descendants((node, pos) => {
            if (cellPos < 0 && node.type.name === "table_cell") cellPos = pos;
        });

        setCursor(view, cellPos + 3);

        const handled = pressShiftEnter(view);
        expect(handled).toBe(true);

        let hasHardbreak = false;
        view.state.doc.descendants((node) => {
            if (node.type.name === "hardbreak") hasHardbreak = true;
        });
        expect(hasHardbreak).toBe(true);

        let hbPos = -1;
        view.state.doc.descendants((node, pos) => {
            if (hbPos < 0 && node.type.name === "hardbreak") hbPos = pos;
        });
        view.dispatch(view.state.tr.insert(hbPos + 1, view.state.schema.text("z")));

        const md = editor.action(getMarkdown());
        expect(md).toContain("x<br>z");
        expect(md).not.toContain("<br>z y");
    });

    it("单元格外 Shift+Enter 应该 放行默认行为（Milkdown 默认 hardbreak，本插件不干预）", async () => {
        const editor = await makeEditor("para one\n");
        const view = getView(editor);
        setCursor(view, 5);
        const handled = pressShiftEnter(view);

        let hasHardbreak = false;
        view.state.doc.descendants((node) => {
            if (node.type.name === "hardbreak") hasHardbreak = true;
        });
        expect(handled).toBe(true);
        expect(hasHardbreak).toBe(true);
    });

    it("单元格内连续两次 Shift+Enter 应该 插入两个 hardbreak（回归：上游命令会把行尾 hardbreak 转段落）", async () => {
        const editor = await makeEditor("| A |\n| --- |\n| x |\n");
        const view = getView(editor);
        let cellPos = -1;
        view.state.doc.descendants((node, pos) => {
            if (cellPos < 0 && node.type.name === "table_cell") cellPos = pos;
        });
        setCursor(view, cellPos + 3);

        expect(pressShiftEnter(view)).toBe(true);
        expect(pressShiftEnter(view)).toBe(true);

        let hardbreakCount = 0;
        view.state.doc.descendants((node) => {
            if (node.type.name === "hardbreak") hardbreakCount++;
        });
        expect(hardbreakCount).toBe(2);
    });
});
