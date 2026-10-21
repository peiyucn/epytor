/**
 * 表格内点行内公式：为什么必须挂在 document 捕获阶段？
 *
 * 这是踩了三轮才查清的因果链，逐条锁住防止再回退：
 *
 * 1. prosemirror-view 的事件入口（dist/index.js:3155）：
 *      if (eventBelongsToView(view, event) && !runCustomHandler(view, event) && ...)
 *    eventBelongsToView 沿 target→view.dom 遍历，遇到任一 desc 的 stopEvent() 返回
 *    true 就判定「事件不属于编辑器」并返回 false → runCustomHandler（即
 *    handleDOMEvents）**根本不会被调用**。
 *
 * 2. Crepe 的 TableNodeView.stopEvent() 对 th/td 内的 mousedown 返回 true
 *    （@milkdown/components table-block:1030-1040），目的就是自己接管表格点击：
 *    设 NodeSelection.create(doc, cellFrom + 1)。实测 cellFrom+1 落在 paragraph
 *    上（isAtom:false），所以那个选区 = **整个单元格内容被选中**（整格蓝框）。
 *
 * 3. 因此「在 handleDOMEvents.mousedown 里识别公式点击」从来不曾执行过。
 *
 * 4. 还有一处会吃掉纠正机会：filterTransaction 对整格 NodeSelection 返回 false
 *    （丢弃 transaction），而 appendTransaction 只在 transaction 成功后运行 ——
 *    丢掉就等于纠正永远不发生。所以 pendingAtomClickPos 非空时必须放行。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// jsdom 环境桩：行为层用例会真正创建编辑器
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() { /* noop */ }, removeListener() { /* noop */ },
        addEventListener() { /* noop */ }, removeEventListener() { /* noop */ },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
for (const name of ["ResizeObserver", "IntersectionObserver"]) {
    if (typeof (window as unknown as Record<string, unknown>)[name] === "undefined") {
        (window as unknown as Record<string, unknown>)[name] = class {
            observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
            takeRecords() { return []; }
        };
    }
}
(window as unknown as Record<string, unknown>).__i18n = {
    translations: {}, isMac: false, serializationMode: "clean",
};

const editorSrc = readFileSync(
    path.resolve(process.cwd(), "webview/editor.ts"),
    "utf-8",
);

/** 按括号配对截出某个函数/处理器正文 */
function block(startMarker: string): string {
    const start = editorSrc.indexOf(startMarker);
    expect(start, `找不到 ${startMarker}`).toBeGreaterThanOrEqual(0);
    const openBrace = editorSrc.indexOf("{", start);
    let depth = 0;
    for (let i = openBrace; i < editorSrc.length; i++) {
        if (editorSrc[i] === "{") depth++;
        else if (editorSrc[i] === "}") {
            depth--;
            if (depth === 0) return editorSrc.slice(start, i + 1);
        }
    }
    throw new Error(`${startMarker} 未闭合`);
}

/** 去掉注释行，只留代码（注释里会提到关键符号，直接断言会误判） */
function codeOnly(src: string): string {
    return src
        .split("\n")
        .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
        .join("\n");
}

describe("公式点击必须用 document 捕获阶段（因果链第 1、2 条）", () => {
    it("应该 在 view() 里挂 document 捕获阶段的 mousedown", () => {
        const pluginView = block("view(editorView) {");
        const code = codeOnly(pluginView);

        expect(code).toContain('document.addEventListener("mousedown"');
        // 第三个参数 true = 捕获阶段（PM 的 stopEvent 影响不到这里）
        expect(code).toMatch(/document\.addEventListener\("mousedown",\s*\w+,\s*true\)/);
        expect(code).toContain("atomPosAtEvent(editorView, event)");
        // 清理对称：destroy 里必须移除
        expect(code).toContain('document.removeEventListener("mousedown"');
    });

    it("handleDOMEvents.mousedown 里 应该 不再做公式识别（表格里走不到）", () => {
        const handler = block("handleDOMEvents: {");
        const code = codeOnly(handler);

        expect(code).not.toContain("atomPosAtEvent");
        // 但保留单元格点击修正本体
        expect(code).toContain("beginClick(cell,");
    });
});

describe("filterTransaction 必须给纠正让路（因果链第 4 条）", () => {
    it("pendingAtomClickPos 非空时 应该 直接放行，不丢弃 transaction", () => {
        const filter = block("filterTransaction(tr, state) {");
        const code = codeOnly(filter);

        // 必须是函数开头的最高优先级判断
        const firstCheck = code.indexOf("pendingAtomClickPos !== null");
        const firstNodeSel = code.indexOf("tr.selection instanceof NodeSelection");
        expect(firstCheck).toBeGreaterThanOrEqual(0);
        expect(firstCheck).toBeLessThan(firstNodeSel);
        expect(code).toMatch(/if \(pendingAtomClickPos !== null\) return true;/);
    });

    it("appendTransaction 应该 把选区纠正到公式（不在此处清意图）", () => {
        const append = block("appendTransaction(_trs, _oldState, newState) {");
        const code = codeOnly(append);

        expect(code).toContain("pendingAtomClickPos !== null");
        expect(code).toContain("NodeSelection.create(newState.doc, atomPos)");
        // 纠正前校验位置仍是原子节点
        expect(code).toContain("node?.isAtom");
        // 已停在公式上就不重复 dispatch
        expect(code).toContain("isAlreadyOnAtom");
        // 意图的清理权归捕获阶段（要经历多轮 rAF 钉选区），这里不得清空，
        // 否则后续 transaction 就没得纠了。
        const atomBranch = code.slice(
            code.indexOf("pendingAtomClickPos !== null"),
            code.indexOf("if (cell.pendingClickPos === null)"),
        );
        expect(atomBranch).not.toContain("pendingAtomClickPos = null");
    });
});

describe("atomPosAtEvent 的判据", () => {
    it("应该 用 closest + posAtDOM + isAtom，拿不到就返回 null", () => {
        const fn = block("function atomPosAtEvent");

        expect(fn).toContain("closest");
        expect(fn).toContain("math_inline");
        expect(fn).toContain("posAtDOM");
        expect(fn).toContain("node.isAtom");
        expect(fn).toMatch(/return null/);
    });
});

describe("行为层：表格里能对公式建立 NodeSelection", () => {
    it("math_inline 应该 仍是 atom:true（编辑气泡依赖 NodeSelection）", () => {
        const latexSrc = readFileSync(
            path.resolve(process.cwd(), "webview/vendor/latexFeature.ts"),
            "utf-8",
        );
        expect(latexSrc).toMatch(/atom:\s*true/);
    });

    it("真实表格里 应该 能对单元格内的公式建立 NodeSelection（且公式确在 cell 内）", async () => {
        const { createEditor, destroyEditor } = await import("../editor");
        const { editorViewCtx } = await import("@milkdown/kit/core");
        const { NodeSelection } = await import("@milkdown/kit/prose/state");

        const root = document.createElement("div");
        document.body.appendChild(root);
        const editor = await createEditor(
            root,
            "| 列A | 列B |\n| --- | --- |\n| $x$ 说明 | 普通 |\n",
            () => {},
        );
        const view = editor.action((ctx) => ctx.get(editorViewCtx));

        let mathPos = -1;
        view.state.doc.descendants((node, pos) => {
            if (node.type.name === "math_inline") mathPos = pos;
        });
        expect(mathPos, "文档里应有 math_inline").toBeGreaterThanOrEqual(0);

        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, mathPos)));
        expect(view.state.selection).toBeInstanceOf(NodeSelection);

        let inCell = false;
        view.state.doc.descendants((node, pos) => {
            if (node.type.name === "table_cell" && pos < mathPos && mathPos < pos + node.nodeSize) {
                inCell = true;
            }
        });
        expect(inCell, "公式应位于 table_cell 内").toBe(true);

        destroyEditor();
        document.body.innerHTML = "";
    }, 40000);
});
