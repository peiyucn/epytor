/**
 * 表格单元格内的行内公式必须能被选中编辑（回归：点不中、编辑框不出现）。
 *
 * 根因：`cellClickFixPlugin` 的 filterTransaction 把**所有**落在表格单元格内的
 * `NodeSelection` 一律转成 `TextSelection`（目的是修正「点单元格时 PM 选中整段」
 * 这个不顺手的行为）。但行内公式 `math_inline` 是 `atom: true`，它的编辑气泡
 * 只在 `NodeSelection` 下才激活——被无差别拦截后，表格里的公式永远选不中。
 *
 * 修法：只拦「单元格段落本身」的 NodeSelection，原子节点（isAtom）一律放行；
 * rAF 补偿回调里也要再判一次，避免覆盖用户刚点中的原子节点选区。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { editorViewCtx } from "@milkdown/kit/core";
import { NodeSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";

if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() { /* noop */ }, removeListener() { /* noop */ },
        addEventListener() { /* noop */ }, removeEventListener() { /* noop */ },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
    };
}
if (typeof (window as unknown as Record<string, unknown>).IntersectionObserver === "undefined") {
    (window as unknown as Record<string, unknown>).IntersectionObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } takeRecords() { return []; }
    };
}

const editorSrc = readFileSync(
    path.resolve(process.cwd(), "webview/editor.ts"),
    "utf-8",
);

/**
 * 截出 `cellClickFixPlugin` 里 `filterTransaction` 的实现正文。
 *
 * 注意 `appendTransaction(` 在文件里出现多次（前面的插件也有），所以不能拿它当
 * 结束标记——按 `filterTransaction(tr, state)` 之后找该函数自己的收尾缩进。
 */
function filterTransactionBlock(): string {
    const start = editorSrc.indexOf("filterTransaction(tr, state) {");
    expect(start, "editor.ts 里应有 cellClickFixPlugin 的 filterTransaction").toBeGreaterThanOrEqual(0);
    // 从起点往后找第一个同层收尾的 "        },"（8 空格缩进 + 逗号）
    const end = editorSrc.indexOf("\n        },", start);
    expect(end, "找不到 filterTransaction 的结束位置").toBeGreaterThan(start);
    return editorSrc.slice(start, end);
}

describe("表格内行内公式的选中（cellClickFixPlugin）", () => {
    it("filterTransaction 应该 先放行原子节点的 NodeSelection", () => {
        // 拦截逻辑的入口必须先判 isAtom 并 return true
        const block = filterTransactionBlock();
        expect(block).toMatch(/if \(tr\.selection\.node\?\.isAtom\) return true;/);
    });

    it("rAF 补偿回调 应该 不覆盖用户刚选中的原子节点", () => {
        const block = filterTransactionBlock();
        expect(block).toMatch(/sel instanceof NodeSelection && sel\.node\?\.isAtom/);
    });

    it("math_inline 应该 仍是 atom:true（编辑气泡依赖 NodeSelection）", () => {
        const latexSrc = readFileSync(
            path.resolve(process.cwd(), "webview/vendor/latexFeature.ts"),
            "utf-8",
        );
        expect(latexSrc).toMatch(/atom:\s*true/);
        expect(latexSrc).toMatch(/draggable:\s*true/);
    });

    it("真实编辑器里 应该 能对表格单元格内的行内公式建立 NodeSelection", async () => {
        // 必须用 epytor 自己的 createEditor（带 latex feature），裸 CrepeBuilder
        // 不装 math 解析器，文档里不会有 math_inline 节点
        const { createEditor, destroyEditor } = await import("../editor");
        const root = document.createElement("div");
        document.body.appendChild(root);
        const editor = await createEditor(
            root,
            "| 列A | 列B |\n| --- | --- |\n| $x$ 说明 | 普通 |\n",
            () => {},
        );
        const view: EditorView = editor.action((ctx) => ctx.get(editorViewCtx));

        // 找到单元格里的 math_inline
        let mathPos = -1;
        let mathNode: ProseNode | null = null;
        view.state.doc.descendants((node, pos) => {
            if (node.type.name === "math_inline") {
                mathPos = pos;
                mathNode = node;
            }
        });
        expect(mathPos, "文档里应有 math_inline 节点").toBeGreaterThanOrEqual(0);
        expect((mathNode as unknown as ProseNode | null)?.isAtom).toBe(true);

        // 建立 NodeSelection：应当成功且选区停在公式上
        view.dispatch(
            view.state.tr.setSelection(NodeSelection.create(view.state.doc, mathPos)),
        );
        expect(view.state.selection).toBeInstanceOf(NodeSelection);
        expect((view.state.selection as NodeSelection).from).toBe(mathPos);

        // 确认该公式确实位于表格单元格内（覆盖真正的回归场景）
        let inCell = false;
        view.state.doc.descendants((node, pos) => {
            if (node.type.name === "table_cell" && pos < mathPos && mathPos < pos + node.nodeSize) {
                inCell = true;
            }
        });
        expect(inCell, "公式应位于 table_cell 内").toBe(true);

        destroyEditor();
        document.body.innerHTML = "";
    }, 30000);
});
