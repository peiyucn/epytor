
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

describe("嵌套标题 schema 行为诊断", () => {
    it("blockquote 内标题 应该 被 schema 接受（若接受：折叠/吸顶口径不一致需统一）", async () => {
        const editor = await makeEditor("> ## 引用内标题\n>\n> 内容\n");
        const view = getView(editor);

        const nested: Array<{ pos: number; depth: number }> = [];
        view.state.doc.descendants((node, pos, parent) => {
            if (node.type.name === "heading" && parent !== null) {
                nested.push({ pos, depth: parent.type.name === "doc" ? 0 : 1 });
            }
            return true;
        });


        expect(nested.length).toBeGreaterThan(0);

        const topLevel = new Set<number>();
        view.state.doc.forEach((node, offset) => {
            if (node.type.name === "heading") topLevel.add(offset);
        });

        expect(nested.every((h) => topLevel.has(h.pos))).toBe(false);
    });
});
