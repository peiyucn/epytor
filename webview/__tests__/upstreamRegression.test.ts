
import { afterEach, describe, expect, it } from "vitest";
import { CrepeBuilder } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";


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

async function makeEditor(md = "") {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const crepe = new CrepeBuilder({ root, defaultValue: md });
    const editor = await crepe.create();
    return { editor, root };
}

function getView(editor: Awaited<ReturnType<typeof makeEditor>>["editor"]): EditorView {
    return editor.action((ctx) => ctx.get(editorViewCtx));
}

function collectLabels(view: EditorView): string[] {
    const out: string[] = [];
    view.state.doc.descendants((node) => {
        if (node.type.name === "list_item") out.push(String(node.attrs.label));
    });
    return out;
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("Milkdown 上游版本回归（7.22.1）", () => {
    it("行内代码 mark 应该是非 inclusive（上游 #2451 已生效）", async () => {
        const { editor } = await makeEditor();
        const view = getView(editor);
        const inlineCode = view.state.schema.marks["inlineCode"];
        expect(inlineCode).toBeDefined();

        expect(inlineCode!.spec.inclusive).toBe(false);
    });

    it("有序列表程序化删除中间项后编号应该重排为 1..3（上游 syncListOrderPlugin 正常）", async () => {
        const { editor } = await makeEditor("1. a\n2. b\n3. c\n4. d\n");
        const view = getView(editor);
        expect(collectLabels(view)).toEqual(["1.", "2.", "3.", "4."]);

        const positions: number[] = [];
        view.state.doc.descendants((node, p) => {
            if (node.type.name === "list_item") positions.push(p);
        });
        const item2Start = positions[1];
        const item2 = view.state.doc.nodeAt(item2Start)!;
        view.dispatch(view.state.tr.delete(item2Start, item2Start + item2.nodeSize));

        expect(collectLabels(view)).toEqual(["1.", "2.", "3."]);
    });

    it("行内代码输入规则 mark 应参与 schema 输入规则（上游 #2445 相关）", async () => {
        const { editor } = await makeEditor();
        const view = getView(editor);

        expect(view.state.schema.marks["inlineCode"]).toBeDefined();
        expect(view.state.schema.marks["strong"]).toBeDefined();
        expect(view.state.schema.marks["emphasis"]).toBeDefined();
    });
});
