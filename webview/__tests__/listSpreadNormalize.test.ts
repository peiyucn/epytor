import { describe, expect, it } from "vitest";
import { undo } from "@milkdown/kit/prose/history";
import type { EditorView } from "@milkdown/kit/prose/view";
import { createEditor, destroyEditor, getEditorView } from "../editor";
import { normalizeListSpread } from "../markdown/listSpread";

if (typeof (window as unknown as Record<string, unknown>).IntersectionObserver === "undefined") {
    (window as unknown as Record<string, unknown>).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
}
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({ matches: false, media: "", onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } })) as typeof window.matchMedia;
}
(window as unknown as Record<string, unknown>).__i18n = { translations: {}, isMac: false, serializationMode: "clean" };

async function mount(markdown: string): Promise<HTMLElement> {
    const root = document.createElement("div");
    document.body.appendChild(root);
    await createEditor(root, markdown, () => {});
    return root;
}

function composeInOneTransaction(view: EditorView, at: number, pinyin: string, hanzi: string): void {
    const tr = view.state.tr.insertText(pinyin, at);
    tr.replaceWith(at, at + pinyin.length, view.state.schema.text(hanzi));
    view.dispatch(tr);
}

describe("列表 spread 规范化", () => {
    it("列表项从多块变回单块 应该 同步收回 spread", async () => {
        const root = await mount("- a\n- b");
        const view = getEditorView()!;
        const list = view.state.doc.firstChild!;
        expect(list.type.name).toBe("bullet_list");
        const itemEnd = 2 + list.firstChild!.content.size;

        view.dispatch(view.state.tr.insert(itemEnd, view.state.schema.nodes.paragraph!.create()));
        expect(view.state.doc.firstChild!.firstChild!.childCount).toBe(2);

        view.dispatch(view.state.tr.delete(itemEnd, itemEnd + 2));
        expect(view.state.doc.firstChild!.firstChild!.attrs.spread).toBe(false);
        expect(view.state.doc.firstChild!.attrs.spread).toBe(false);

        destroyEditor(); root.remove();
    }, 60000);

    it("回归（2026-10-26）：嵌套任务列表两项结构 应该 不被强标成松散（否则每项之间多出空行）", async () => {

        const root = await mount("- [ ] P\n  - [ ] C1\n  - [ ] C2\n  - [ ] C3");
        const view = getEditorView()!;
        expect(view.state.doc.firstChild!.attrs.spread).toBe(false);

        expect(view.state.doc.firstChild!.firstChild!.childCount).toBe(2);
        const tr = view.state.tr;
        normalizeListSpread(tr.doc, view.state.schema, tr, { from: 0, to: tr.doc.content.size });
        expect(tr.steps).toHaveLength(0);
        destroyEditor(); root.remove();
    }, 60000);

    it("回归（2026-10-26）：用户手写的松散列表 应该 保持松散（空行保真）", async () => {
        const root = await mount("- a\n\n- b\n\n- c");
        const view = getEditorView()!;
        expect(view.state.doc.firstChild!.attrs.spread).toBe(true);
        const tr = view.state.tr;
        normalizeListSpread(tr.doc, view.state.schema, tr, { from: 0, to: tr.doc.content.size });
        expect(tr.steps).toHaveLength(0);
        destroyEditor(); root.remove();
    }, 60000);

    describe("单事务多步（输入法提交形态）", () => {
        it("段落内 应该 不抛错且区间落在最终坐标", async () => {
            const root = await mount("hello");
            const view = getEditorView()!;
            composeInOneTransaction(view, 6, "nihao", "你好");
            expect(view.state.doc.textContent).toBe("hello你好");
            destroyEditor(); root.remove();
        }, 60000);

        it("段落内 应该 一次撤销回到初始（回归：撤销「没反应」）", async () => {
            const root = await mount("hello");
            const view = getEditorView()!;
            composeInOneTransaction(view, 6, "nihao", "你好");
            expect(view.state.doc.textContent).toBe("hello你好");
            expect(undo(view.state, (tr) => view.dispatch(tr))).toBe(true);
            expect(view.state.doc.textContent).toBe("hello");
            destroyEditor(); root.remove();
        }, 60000);

        it("列表项内 应该 不抛错", async () => {
            const root = await mount("- hello\n- b");
            const view = getEditorView()!;

            const item = view.state.doc.firstChild!.firstChild!;
            const at = 3 + item.firstChild!.content.size;
            composeInOneTransaction(view, at, "nihao", "你好");
            expect(view.state.doc.textContent).toBe("hello你好b");

            expect(view.state.doc.firstChild!.childCount).toBe(2);
            expect(view.state.doc.firstChild!.firstChild!.textContent).toBe("hello你好");
            destroyEditor(); root.remove();
        }, 60000);
    });
});
