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
 * 截出 `cellClickFixPlugin` 里 `mousedown` 处理器的实现正文。
 *
 * 用括号配对而不是找固定字符串——缩进/换行一变，固定串就失配，
 * 会把整个文件尾部算进来（测试里踩过两次）。
 */
function mousedownBlock(): string {
    const start = editorSrc.indexOf("mousedown: (view, event) =>");
    expect(start, "editor.ts 里应有 cellClickFixPlugin 的 mousedown").toBeGreaterThanOrEqual(0);
    const openBrace = editorSrc.indexOf("{", start);
    let depth = 0;
    for (let i = openBrace; i < editorSrc.length; i++) {
        const ch = editorSrc[i];
        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return editorSrc.slice(start, i + 1);
        }
    }
    throw new Error("mousedown 块未闭合");
}

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
    it("mousedown 应该 只登记意图，不在当场 dispatch（否则被 Crepe 的 rAF 覆盖）", () => {
        // 回归根因：Crepe 的 TableNodeView.stopEvent() 在 mousedown 里用
        // NodeSelection.create(doc, cellFrom+1) 设选区并 rAF 延迟 dispatch。
        // 谁后写谁生效——当场设会被覆盖成「选中单元格段落」= 整格高亮。
        // 截取范围必须止于 mousedown 自己的收尾，否则会把后面的代码也算进来。
        const block = mousedownBlock();
        // 断言只看**代码行**：注释里会提到 NodeSelection.create（解释回归根因），
        // 直接对整块做 toContain 会误判。
        const code = block
            .split("\n")
            .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
            .join("\n");

        expect(code).toContain("atomPosAtEvent(view, event)");
        expect(code).toContain("pendingAtomClickPos = atomPos");
        // 不允许在 mousedown 里 dispatch 选区（会被 Crepe 的 rAF 覆盖）
        expect(code).not.toContain("NodeSelection.create");
        expect(code).not.toContain("event.preventDefault()");
    });

    it("appendTransaction 应该 把选区纠正回公式的 NodeSelection", () => {
        // appendTransaction 是所有 transaction 的最后关口，rAF 里那条也走这里
        const block = editorSrc.slice(
            editorSrc.indexOf("appendTransaction(_trs, _oldState, newState)"),
            editorSrc.indexOf("if (cell.pendingClickPos === null) return null;"),
        );
        expect(block, "appendTransaction 里应先处理原子的 pending 意图").toContain("pendingAtomClickPos !== null");
        expect(block).toContain("NodeSelection.create(newState.doc, atomPos)");
        // 纠正前必须校验位置仍是原子节点（重绘/插入可能让它失效）
        expect(block).toContain("node?.isAtom");
        // 已经停在公式上时不要再 dispatch（避免自激）
        expect(block).toContain("isAlreadyOnAtom");
    });

    it("点别处 应该 清掉上一次的公式点击意图（避免旧意图劫持选区）", () => {
        const block = mousedownBlock();
        // 清理点必须出现在「公式命中分支之后」，且至少两处
        // （修饰键分支 + 非公式分支），否则「先点公式再点别处」会被旧意图劫持
        const occurrences = block.split("pendingAtomClickPos = null").length - 1;
        expect(occurrences).toBeGreaterThanOrEqual(2);
        // 公式命中分支本身应把意图设上
        expect(block).toContain("pendingAtomClickPos = atomPos");
    });

    it("atomPosAtEvent 应该 只在点到原子节点时返回位置", () => {
        const fn = editorSrc.slice(
            editorSrc.indexOf("function atomPosAtEvent"),
            editorSrc.indexOf("/** 位置所属单元格的起始坐标"),
        );
        expect(fn).toContain("closest");
        expect(fn).toContain("posAtDOM");
        expect(fn).toContain("node.isAtom");
        // 拿不到就返回 null，交回浏览器默认行为（不做乐观接管）
        expect(fn).toMatch(/return null/);
    });

    it("filterTransaction 应该 仍放行原子节点的 NodeSelection（双保险）", () => {
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
