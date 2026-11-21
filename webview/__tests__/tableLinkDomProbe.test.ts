
import { afterEach, describe, expect, it } from "vitest";
import { CrepeBuilder } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {  } unobserve() {  } disconnect() {  }
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
    return crepe.create();
}

function getView(editor: Awaited<ReturnType<typeof makeEditor>>): EditorView {
    return editor.action((ctx) => ctx.get(editorViewCtx));
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("表格内自动链接 DOM 形态诊断", () => {
    it("<https://...> 尖括号自动链接 应该 渲染为 a 元素", async () => {
        const editor = await makeEditor(
            "| URL |\n| --- |\n| <https://example.com/very/long/path/to/resource> |\n",
        );
        const view = getView(editor);
        const td = view.dom.querySelector("td");
        expect(td).not.toBeNull();

        const anchor = td!.querySelector("a");
        expect(anchor).not.toBeNull();
        expect(anchor!.textContent).toContain("https://example.com");

        expect(anchor!.parentElement?.tagName).toBe("P");
    });

    it("裸 URL（无尖括号） 应该 也渲染为 a 元素", async () => {
        const editor = await makeEditor(
            "| URL |\n| --- |\n| https://example.com/very/long/path/to/resource |\n",
        );
        const view = getView(editor);
        const anchor = view.dom.querySelector("td a");
        expect(anchor).not.toBeNull();
    });

    it("CSS 选择器链 .milkdown .ProseMirror table td a 应该 命中（wrapMode 断行规则的前提）", async () => {
        const editor = await makeEditor(
            "| URL |\n| --- |\n| <https://example.com/very/long/path/to/resource> |\n",
        );
        const view = getView(editor);

        const hit = document.querySelector(".milkdown .ProseMirror table td a");
        expect(hit).not.toBeNull();
        const td = view.dom.querySelector("td");
        expect(td).not.toBeNull();
        expect(td!.closest(".milkdown")).not.toBeNull();
        expect(td!.closest(".ProseMirror")).not.toBeNull();





        expect(document.querySelector(".milkdown-table-block")).toBeNull();
    });
});
