
import { describe, expect, it } from "vitest";
import { CrepeBuilder } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import { buildFoldDecorations } from "../editor/plugins/headingFoldPlugin";

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

describe("buildFoldDecorations 性能基准（防 O(n²) 回归）", () => {
    it("2 万行（4000 标题）文档 应该 在 800ms 内完成（回归：O(n²) 每标题全量扫描同规模约 1.2s）", async () => {
        const lines: string[] = [];
        for (let i = 0; i < 4000; i++) {
            lines.push(`## 标题 ${i}`);
            lines.push("正文一行内容");
            lines.push("正文二行内容");
            lines.push("");
        }
        const md = lines.join("\n");
        const editor = await makeEditor(md);
        const view = getView(editor);

        const t0 = performance.now();
        const result = buildFoldDecorations(view.state.doc, new Set());
        const elapsed = performance.now() - t0;

        console.log(`[bench] 2万行 buildFoldDecorations: ${elapsed.toFixed(1)}ms, decorations=${result.find().length}`);
        expect(result.find().length).toBe(8000);




        expect(elapsed).toBeLessThan(800);
    }, 120000);
});
