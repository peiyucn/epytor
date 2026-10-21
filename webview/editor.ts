import {
    commandsCtx,
    defaultValueCtx,
    Editor,
    editorViewCtx,
    nodeViewCtx,
    rootCtx,
    schemaCtx,
} from "@milkdown/kit/core";
import {
    toggleStrongCommand,
    toggleEmphasisCommand,
    toggleInlineCodeCommand,
    listItemSchema,
    inlineCodeSchema,
} from "@milkdown/kit/preset/commonmark";
import { toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { keymap } from "@milkdown/kit/prose/keymap";
import { closeHistory } from "@milkdown/kit/prose/history";
import { Plugin, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { CellSelection } from "@milkdown/kit/prose/tables";
import { $prose, getMarkdown } from "@milkdown/kit/utils";
import { CrepeBuilder } from "@milkdown/crepe";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";

// ─── Crepe 原生功能 ──────────────────────────────────────────────────────────
// 以下 feature 由 @milkdown/crepe 官方维护，替换我们的自定义实现：
//   feature/table       → 替换 addButtons + handles + toolbar（1,562 行）
//   feature/code-mirror → 替换 codeBlock NodeView + Prism（1,909 行）
//   feature/toolbar     → 选中文字浮动工具栏（启用）
//   feature/latex       → 全新：KaTeX 数学公式支持
// feature/code-mirror → 换回自定义实现（复制反馈、全屏、样式更精致）
import { codeMirror } from "@milkdown/crepe/feature/code-mirror";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { createVirtualCursor } from "./vendor/prosemirrorVirtualCursor";
// LaTeX feature 用本地惰性 KaTeX 实现（上游静态 import katex 会压入口 480KB，
// 见 vendor/latexFeature.ts 头部注释与 esbuild.mjs katex-stub-for-crepe）
import { latexFeature, createMathInlineView, renderLatexPreview } from "./vendor/latexFeature";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { table } from "@milkdown/crepe/feature/table";
import { topBar } from "@milkdown/crepe/feature/top-bar";
import { buildTopBarConfig } from "./components/topBar/buildTopBar";
import { toolbar } from "@milkdown/crepe/feature/toolbar";
import { Compartment } from "@codemirror/state";
import { EditorView as CMEditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultHighlightStyle, syntaxHighlighting, LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages as allCodeLanguages } from "@codemirror/language-data";
import { onThemeChange, isDarkTheme } from "./utils/themeBus";
import { changeRangeInFinalDoc, normalizeListSpread } from "./utils/listSpread";
import { listBackspacePlugin } from "./utils/listBackspace";
import { taskListItemEnterPlugin } from "./utils/taskListItemEnter";
import { listMarkerPlugin } from "./listMarkerPlugin";
import {
    beginClick,
    consumeCellClickTarget,
    createCellClickState,
    decideCellSelection,
    endClick,
    markDragged,
} from "./utils/cellClickState";
import { observeCmEditorCount } from "./utils/cmThemeObserver";
import { getUserInteractionEpoch } from "./utils/userInteraction";
import { t } from "./i18n";
import { enhanceMermaidPreview } from "./components/mermaidZoom";
import { headingFoldPlugin } from "./headingFoldPlugin";
import { headingStickyPlugin } from "./headingStickyPlugin";
import { softBreakKeymap } from "./softBreakKeymap";
import { applyMinimalChanges } from "./utils/minimalDiff";
import { remarkStringifyOptionsCtx } from "@milkdown/kit/core";
import { emptyTaskListItemPlugin } from "./utils/emptyTaskListItem";
import { $remark } from "@milkdown/kit/utils";
import {
    cleanTextHandler,
    detectLineEnding,
    detectListMarkerStyle,
    dropRedundantAmpersandEscapes,
    serializeCleanMarkdown,
    stripListItemBreakPlaceholder,
    toLf,
    withLineEnding,
    withTableBreakHandler,
    type SerializationMode,
} from "./utils/markdownSerializer";

// 空任务项（`- [ ] ` 后面什么都不写）识别：上游 task-list 分词器要求标记后有内容，
// 这里在 remark-gfm 之后补一层 mdast 修正（见 utils/emptyTaskListItem.ts）
const emptyTaskListItemRemark = $remark("epytorEmptyTaskListItem", () => emptyTaskListItemPlugin);

// 只保留常用语言（143 → ~40）
const WANTED_LANGS = new Set([
    "bash", "sh", "c", "cpp", "c++", "csharp", "c#", "css", "go", "html",
    "java", "javascript", "js", "json", "kotlin", "latex", "less", "lua",
    "markdown", "md", "mermaid", "php", "python", "py", "ruby", "rust",
    "sass", "scss", "sql", "swift", "toml", "typescript", "ts", "xml", "yaml", "yml",
]);
const codeLanguages = allCodeLanguages.filter(
    (l: { alias: readonly string[] }) => l.alias.some((a) => WANTED_LANGS.has(a))
);
// Mermaid 不在 @codemirror/language-data 中，手动添加（仅标签，无语法高亮）
codeLanguages.unshift(LanguageDescription.of({
    name: "Text",
    alias: ["text", "plaintext", "txt"],
    extensions: ["txt"],
    load: async () => undefined as unknown as LanguageSupport,
}));
codeLanguages.push(LanguageDescription.of({
    name: "Mermaid",
    alias: ["mermaid"],
    extensions: ["mmd"],
    load: async () => undefined as unknown as LanguageSupport,
}));
// feature/toolbar 暂不启用（与自定义工具栏冲突）

// ─── 保留的自定义插件 ────────────────────────────────────────────────────────
// 以下插件 Crepe 不提供对应功能，永久保留：
//   listSpreadNormalizePlugin → 列表 spread 规范化
//   listBackspacePlugin      → 列表项行首 Backspace 的落点（见 utils/listBackspace.ts 文件头）
//   taskListItemEnterPlugin  → 任务项回车新建项默认未勾选（见 utils/taskListItemEnter.ts 文件头）
//   formatKeymapPlugin       → 自定义格式化快捷键
// 说明：列表 Backspace 的**编号**仍走官方默认（joinBackward：合并/删除行，编号自动重排），
// Shift-Tab = liftListItem（提升层级）。但官方 joinBackward 在 Crepe 的列表 schema 下按「项」
// 合并，会把空项留成上一项里的空段落、光标停在那一段上（手测反馈「光标上移错位、上下键走不动」），
// 任务列表还会把标记漏进正文——listBackspacePlugin 只修正**落点与合并方式**，不碰编号。

// 格式化快捷键：Mod-b 粗体、Mod-i 斜体、Mod-Shift-x 删除线、Mod-e 行内代码
const formatKeymapPlugin = $prose((ctx) =>
    keymap({
        "Mod-b": () => {
            ctx.get(commandsCtx).call(toggleStrongCommand.key);
            return true;
        },
        "Mod-i": () => {
            ctx.get(commandsCtx).call(toggleEmphasisCommand.key);
            return true;
        },
        "Mod-Shift-x": () => {
            ctx.get(commandsCtx).call(toggleStrikethroughCommand.key);
            return true;
        },
        "Mod-e": () => {
            const view = ctx.get(editorViewCtx);
            const { state } = view;
            if (!state.selection.empty) {
                ctx.get(commandsCtx).call(toggleInlineCodeCommand.key);
                return true;
            }
            const codeMark = state.schema.marks["inlineCode"];
            if (!codeMark) return true;
            const { from } = state.selection;
            const textNode = state.schema.text("​", [codeMark.create()]);
            const tr = state.tr.insert(from, textNode);
            tr.setSelection(TextSelection.create(tr.doc, from + 1));
            view.dispatch(tr);
            return true;
        },
    }),
);

// 列表 spread 规范化：编辑后若列表项只含单个块级子节点，自动将 spread 重置为 false。
// 区间换算与规范化本体在 utils/listSpread.ts（纯逻辑，可直测边界）。
const listSpreadNormalizePlugin = $prose((ctx) => {
    const schema = ctx.get(schemaCtx);
    return new Plugin({
        appendTransaction(transactions, _oldState, newState) {
            const range = changeRangeInFinalDoc(transactions, newState.doc.content.size);
            if (!range) { return null; }
            const tr = newState.tr;
            return normalizeListSpread(newState.doc, schema, tr, range) ? tr : null;
        },
    });
});

// ─── 表格单元格点击修正 ──────────────────────────────────────────────────────
// 状态机与转移函数在 utils/cellClickState.ts（回归：9 个可变标志散在三个回调里互相读写）。

const cellClickFixPlugin = $prose(() => {
    const cell = createCellClickState();
    let capturedView: EditorView | null = null;

    /**
     * 本次 mousedown 是否点在某一行内公式上（值为该公式的文档位置）。
     *
     * 为什么要这个中间状态，而不是在 mousedown 里直接把选区设成 NodeSelection：
     * Crepe 的 `TableNodeView.stopEvent()` 也在 mousedown 处理单元格点击，它会
     * `NodeSelection.create(doc, cellFrom + 1)`（**用 rAF 延迟 dispatch**）。
     * 谁后写谁生效——我们在 mousedown 里设的，会被它那条 rAF 覆盖成「选中单元格
     * 第一个子节点」，也就是整格段落高亮（owner 真机截图：整格被蓝框圈住）。
     *
     * 所以做法是：mousedown 只登记意图，由 `appendTransaction` 在每次选区变更后
     * 兜底纠正——那里是所有 transaction 的最后一道关口，rAF 里那条也逃不掉。
     * 纠正成功后立刻清空，不长期劫持用户选区。
     */
    let pendingAtomClickPos: number | null = null;

    return new Plugin({
        view(editorView) {
            capturedView = editorView;

            // **必须挂在 document 的捕获阶段，不能只用 handleDOMEvents。**
            //
            // prosemirror-view 的事件入口（dist/index.js:3155）是：
            //   if (eventBelongsToView(view, event) && !runCustomHandler(view, event) && ...)
            // 而 eventBelongsToView 会沿 target→view.dom 遍历，遇到任一 desc 的
            // stopEvent() 返回 true 就判定「这个事件不属于编辑器」，直接返回 false ——
            // 于是 runCustomHandler（也就是 handleDOMEvents）**根本不会被调用**。
            //
            // Crepe 的 TableNodeView.stopEvent() 恰好对 th/td 内的 mousedown 返回 true
            // （@milkdown/components table-block:1030-1040），目的就是自己接管表格点击
            // （设 NodeSelection.create(doc, cellFrom+1) = 选中整格）。所以在表格里，
            // handleDOMEvents 里的 mousedown 从来没有执行过 —— 这就是「改了跟没改一样」
            // 的真正原因。
            //
            // 捕获阶段在 PM 的任何处理之前跑，不受 stopEvent 影响。
            const onCaptureMouseDown = (event: MouseEvent) => {
                if (event.button !== 0 || event.detail !== 1 ||
                    event.shiftKey || event.ctrlKey || event.metaKey) {
                    pendingAtomClickPos = null;
                    return;
                }
                const atomPos = atomPosAtEvent(editorView, event);
                pendingAtomClickPos = atomPos;
                if (atomPos === null) return;

                // **在捕获阶段就把选区设成公式，并用两个 rAF 反复确认。**
                //
                // 只靠 appendTransaction 兜底实测无效（owner 四次真机复验），
                // 因为 Crepe 的表格点击也用 rAF 派发、还会再套一层（见下方
                // filterTransaction 里的 rAF），谁最后写谁生效。
                // 这里不跟它抢「谁先」，而是持续把选区钉回公式：捕获后立即一次，
                // 下一个 rAF 再一次（覆盖 Crepe 那条），再下一个 rAF 收尾清标记。
                // 每一步都校验位置仍是原子节点，节点被删就放弃。
                const pinSelectionToAtom = () => {
                    const node = editorView.state.doc.nodeAt(atomPos);
                    if (!node?.isAtom) return;
                    const sel = editorView.state.selection;
                    if (sel instanceof NodeSelection && sel.from === atomPos) return;
                    try {
                        editorView.dispatch(
                            editorView.state.tr.setSelection(
                                NodeSelection.create(editorView.state.doc, atomPos),
                            ),
                        );
                    } catch { /* 位置失效（节点刚被删）时放弃 */ }
                };

                pinSelectionToAtom();
                requestAnimationFrame(() => {
                    pinSelectionToAtom();
                    requestAnimationFrame(() => {
                        pinSelectionToAtom();
                        // 三步都做完才清标记：期间任何一次选区变更都会被
                        // appendTransaction 里的纠正接住
                        pendingAtomClickPos = null;
                    });
                });
            };
            document.addEventListener("mousedown", onCaptureMouseDown, true);

            return {
                destroy() {
                    document.removeEventListener("mousedown", onCaptureMouseDown, true);
                    capturedView = null;
                },
            };
        },
        props: {
            handleDOMEvents: {
                // 注意：表格内的 mousedown **不会**走到这里——Crepe 的
                // TableNodeView.stopEvent() 对 th/td 返回 true，prosemirror-view 的
                // eventBelongsToView 会据此判定事件不属于编辑器，跳过 runCustomHandler。
                // 「点公式」的识别因此放在 view() 里的 document 捕获阶段监听。
                mousedown: (view, event) => {
                    if (event.button !== 0 || event.detail !== 1 || event.shiftKey || event.ctrlKey || event.metaKey) {
                        beginClick(cell, null);
                        return false;
                    }
                    if (!(event.target as Element).closest("td, th")) {
                        beginClick(cell, null);
                        return false;
                    }
                    const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
                    beginClick(cell, at ? { pos: at.pos, x: event.clientX, y: event.clientY } : null);

                    const originX = event.clientX;
                    const originY = event.clientY;
                    const onMove = (mv: MouseEvent) => markDragged(cell, mv.clientX, mv.clientY, originX, originY);
                    document.addEventListener("mousemove", onMove, true);

                    const cleanup = () => {
                        document.removeEventListener("mouseup", cleanup, true);
                        document.removeEventListener("mousemove", onMove, true);
                        endClick(cell);
                    };
                    document.addEventListener("mouseup", cleanup, true);
                    return false;
                },
            },
        },
        filterTransaction(tr, state) {
            // **用户点的是行内公式时，放行一切选区变更，交给 appendTransaction 纠正。**
            //
            // 否则这里会把 Crepe 那条「选中整格」的 transaction 直接丢掉（返回 false），
            // 而 appendTransaction 只在 transaction 成功应用后才跑 —— 丢掉就等于
            // 纠正永远不会发生，整格蓝框也就一直在（owner 三次真机复验）。
            if (pendingAtomClickPos !== null) return true;

            // 原生表格单击→NodeSelection（单元格内段落）→拦截并转为光标定位
            if (tr.selection instanceof NodeSelection) {
                // 单元格里直接点中原子节点（行内公式，atom:true）时不要拦：
                // 它靠 NodeSelection 才能激活编辑气泡。
                if (tr.selection.node?.isAtom) return true;
                try {
                    const $pos = state.doc.resolve(Math.min(tr.selection.from, state.doc.content.size));
                    for (let d = $pos.depth; d >= 0; d--) {
                        const t = $pos.node(d).type.name;
                        if (t === "table_cell" || t === "table_header") {
                            // 在 Crepe rAF 内被拦截；再套一层 rAF 补 TextSelection
                            const clickPos = consumeCellClickTarget(cell);
                            requestAnimationFrame(() => {
                                const v = capturedView;
                                if (!v) return;
                                // 用户点的是行内公式：不得改成光标（否则编辑气泡不会出现）
                                if (pendingAtomClickPos !== null) return;
                                const sel = v.state.selection;
                                if (sel instanceof TextSelection && sel.from === sel.to) return; // 已有光标
                                // rAF 延迟期间用户可能已选中原子节点（如点了行内公式），别再覆盖
                                if (sel instanceof NodeSelection && sel.node?.isAtom) return;
                                try {
                                    const p = Math.min(clickPos ?? tr.selection.from, v.state.doc.content.size);
                                    v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(p))));
                                } catch { /* 单击位置无效，不修正选区 */ }
                            });
                            return false;
                        }
                    }
                } catch { /* 非表格节点内的 $pos 遍历，忽略 */ }
            }
            if (!cell.lastGoodCellSelection) return true;
            if (state.selection instanceof CellSelection && !(tr.selection instanceof CellSelection)) {
                return false;
            }
            return true;
        },
        appendTransaction(_trs, _oldState, newState) {
            // **最高优先级：用户点的是行内公式，就必须停在公式的 NodeSelection 上。**
            //
            // Crepe 的 TableNodeView.stopEvent() 会在 mousedown 时把选区设成
            // `NodeSelection.create(doc, cellFrom + 1)`（rAF 延迟 dispatch）——
            // 单元格第一个子节点通常是段落，于是整格被蓝框圈住，公式自己的
            // NodeSelection 被覆盖，编辑气泡也就不出现（owner 真机两处截图）。
            // appendTransaction 是所有 transaction 的最后一道关口，rAF 里那条
            // 也走这里，所以在这纠正最可靠。
            if (pendingAtomClickPos !== null) {
                const atomPos = pendingAtomClickPos;
                // **不在这里清 pendingAtomClickPos**：捕获阶段那套 rAF 连续钉选区
                // 要经历多次 transaction，每次都可能被改写。清空时机由捕获阶段
                // 自己控制（三轮钉完再清），这里只负责每次变更后纠回公式。
                const node = newState.doc.nodeAt(atomPos);
                if (node?.isAtom) {
                    const isAlreadyOnAtom =
                        newState.selection instanceof NodeSelection &&
                        newState.selection.from === atomPos;
                    if (!isAlreadyOnAtom) {
                        return newState.tr.setSelection(
                            NodeSelection.create(newState.doc, atomPos),
                        );
                    }
                }
                return null;
            }

            if (cell.pendingClickPos === null) return null;
            const sel = newState.selection;
            if (!(sel instanceof CellSelection)) { return null; }
            if (sel.isRowSelection() || sel.isColSelection()) { return null; }

            const decision = decideCellSelection(cell, {
                isRowOrCol: false, // 上面已先行排除整行/整列
                anchorCellPos: sel.$anchorCell.pos,
                headCellPos: sel.$headCell.pos,
            });
            if (decision.kind === "rememberCrossCell") {
                cell.lastGoodCellSelection = sel;
                return null;
            }

            const clickPos = cell.pendingClickPos;
            const $pos = newState.doc.resolve(Math.min(clickPos, newState.doc.content.size));
            try {
                if (!cell.clickIsPlain && capturedView) {
                    const toCoords = capturedView.posAtCoords({ left: cell.lastMouseX, top: cell.lastMouseY });
                    if (toCoords) {
                        const headP = Math.min(toCoords.pos, newState.doc.content.size);
                        try {
                            if (cellStartAt(newState.doc, clickPos) !== cellStartAt(newState.doc, headP)) { return null; }
                        } catch { /* 单元格边界检测失败（文档结构变化），回退为单格光标 */ }
                        return newState.tr.setSelection(
                            TextSelection.create(newState.doc, headP, Math.min(clickPos, newState.doc.content.size)),
                        );
                    }
                }
                return newState.tr.setSelection(TextSelection.near($pos));
            } catch { /* 位置无效（如节点刚被删除），不修正选区 */ return null; }
        },
    });
});

/**
 * 点击落点处的原子节点（行内公式等）的文档位置。
 *
 * 只有「点在这个原子节点自己的 DOM 上」才算数——用 `closest` 找祖先里的
 * `[data-type]` 节点，避免把点击单元格空白处误判成点公式。
 * 返回 null 表示这次点击不是冲着原子节点来的。
 */
function atomPosAtEvent(view: EditorView, event: MouseEvent): number | null {
    const target = event.target as Element | null;
    if (!target) return null;
    const atomEl = target.closest<HTMLElement>("[data-type='math_inline']");
    if (!atomEl) return null;
    try {
        const pos = view.posAtDOM(atomEl, 0);
        const node = view.state.doc.nodeAt(pos);
        return node && node.isAtom ? pos : null;
    } catch {
        return null; // DOM 与文档不同步（正在重绘）时放弃接管，交回浏览器默认行为
    }
}

/** 位置所属单元格的起始坐标（-1 = 不在单元格内） */
function cellStartAt(doc: ProseNode, pos: number): number {
    const $pos = doc.resolve(Math.min(pos, doc.content.size));
    for (let d = $pos.depth; d >= 0; d--) {
        const name = $pos.node(d).type.name;
        if (name === "table_cell" || name === "table_header") { return $pos.start(d); }
    }
    return -1;
}

// ─── 自定义视图组件 ─────────────────────────────────────────

import { createImageView } from "./components/imageView";

// ─── 编辑器实例管理 ──────────────────────────────────────────────────────────

let _editor: Editor | null = null;
let _savedMarkdown = '';
/**
 * 上次保存时的文档快照：与当前 doc 相等 = 「自上次保存以来没编辑过」，保存时直接回原文
 * （见 `getMarkdownForSave`）。null = 必须重序列化一次（序列化模式切换等）。
 */
let _savedDoc: ProseNode | null = null;
/** CodeMirror 主题补配观察器断开函数（编辑器重建时先断开旧的） */
let _disconnectCmObserver: (() => void) | null = null;
/** 主题订阅退订句柄（createEditor 订阅、destroyEditor 退订）——
 * 回归：退订函数曾被丢弃，init/revert 每次重建向 themeBus 泄漏一个监听器，
 * 闭包持有整篇旧文档的 mermaidCodeMap 且主题切换时重放全部旧回调 */
let _unsubscribeTheme: (() => void) | null = null;
let _serializationMode: SerializationMode = "clean";

export function setSerializationMode(mode: SerializationMode): void {
    // 序列化口径变化必须重序列化一次：作废快照，否则未编辑保存会继续回原文、模式切换不生效
    if (mode !== _serializationMode) { _savedDoc = null; }
    _serializationMode = mode;
}

/** 当前序列化模式（回归测试观测口：init/revert 重建不得重置运行期配置） */
export function getSerializationMode(): SerializationMode {
    return _serializationMode;
}

/**
 * 保存前的收尾（序列化 → 归一化 → 最小行改动 → 还原原文行尾）。
 *
 * 三件事（都在两种序列化模式下生效）：
 * 1. 擦掉列表项空内容占位 `<br />`（`stripListItemBreakPlaceholder`）；
 * 2. 去掉多余的 `\&` 转义（`dropRedundantAmpersandEscapes`）；
 * 3. **行尾保真**：比较与序列化统一在 LF 口径下做，最后按源文件惯用行尾写回。源是 CRLF 时
 *    逐行签名会带上 `\r`、与 LF 序列化结果永远不相等，导致「全文都被判为改动」（用户看到的
 *    是整篇被重排）；写盘又是直接写字节，不还原就每存一次把 CRLF 文件改成 LF。
 */
function prepareMarkdownForSave(source: string, serialized: string): string {
    const eol = detectLineEnding(source);
    const sourceLf = toLf(source);
    const normalized = dropRedundantAmpersandEscapes(stripListItemBreakPlaceholder(toLf(serialized)));
    const withoutEol = (() => {
        if (_serializationMode === "compatible") return applyMinimalChanges(sourceLf, normalized);
        try {
            return applyMinimalChanges(sourceLf, serializeCleanMarkdown(sourceLf, normalized));
        } catch (error) {
            // 错误日志保留（与调试开关无关）：clean 序列化器异常时回退 compatible 输出，
            // 静默回退会掩盖序列化器缺陷
            console.warn("[markdown-serialization] Clean serializer failed; using compatible output", { error });
            return applyMinimalChanges(sourceLf, normalized);
        }
    })();
    return withLineEnding(withoutEol, eol);
}

export function getEditorView(): EditorView | null {
    if (!_editor) return null;
    return _editor.action((ctx) => ctx.get(editorViewCtx));
}

/**
 * 销毁当前编辑器并清理其侧效应（主题订阅、CodeMirror 观察器、模块引用）；幂等。
 * revert/重建前由宿主调用（替代直接 _editor.destroy()）。
 */
export function destroyEditor(): void {
    _unsubscribeTheme?.();
    _unsubscribeTheme = null;
    _disconnectCmObserver?.();
    _disconnectCmObserver = null;
    _editor?.destroy();
    _editor = null;
    _savedDoc = null;
}

/**
 * 保存时拉取序列化（拉取式架构的序列化唯一入口）：
 * Extension 在自动保存防抖到点 / Cmd+S 时 requestContent，webview 在此序列化一次
 * （含 clean 模式处理 + minimalDiff 保留未改行原文）并回传。输入期间零序列化。
 */
export function getMarkdownForSave(): string {
    if (!_editor) return _savedMarkdown;
    const view = _editor.action((ctx) => ctx.get(editorViewCtx));
    // 未编辑保存 → 直接回原文（逐字保真 + 省一次序列化）。
    // 回归（2026-10-18，owner 真机发现）：Milkdown 7.22.2 起序列化输出的结尾空行变化，
    // 让 minimalDiff 里「非空行 1:1 匹配且两串长度相等 → 原样返回 saved」这条快速路径失效，
    // 未编辑保存也进入逐行重写——松散列表（列表项之间有空行）的空行被 tight 序列化吃掉，
    // 列表由 loose 变 tight。这里以「doc 与上次保存时相等」为准，不依赖序列化文本的巧合。
    if (_savedDoc && view.state.doc.eq(_savedDoc)) { return _savedMarkdown; }
    const serialized = _editor.action(getMarkdown());
    const toSave = prepareMarkdownForSave(_savedMarkdown, serialized);
    _savedMarkdown = toSave;
    _savedDoc = view.state.doc;
    return toSave;
}

export async function createEditor(
    container: HTMLElement,
    initialMarkdown: string,
    onDocumentChanged: () => void,
    onRenameImage?: (webviewUri: string, newBasename: string) => Promise<void>,
    onTocToggle?: () => void,
): Promise<Editor> {
    // 回归（F1）：不再在此重置序列化模式——init 与 revert 都走 createEditor，
    // 用启动快照重置会把用户中途改的配置静默回滚（外部写盘触发 revert 即复现）。
    // 运行期配置统一由 init 消息载荷与 setSerializationMode 消息维护。
    // 用户交互纪元快照（回归 F4：与 index.ts 的延迟滚动共用同一跟踪器）
    const interactionEpochAtCreate = getUserInteractionEpoch();

    let isSettled = false;

    // 文档变更轻量通知（不含序列化）。
    // 架构调整：序列化从「每键推送」（listener markdownUpdated 每键全量序列化，
    // 1 万行基准 52-99ms 尖峰）改为「保存时拉取」——Extension 在自动保存防抖到点
    // 或 Cmd+S 时发 requestContent，webview 才序列化一次回传。输入期间零序列化。
    // 仅 doc 变化才通知（回归：光标移动/选区变化也是 dispatch，曾误发脏标记，
    // 未编辑也出现 ● 圆点）
    let prevDoc: ProseNode | null = null;
    const updateNotifyPlugin = $prose(() =>
        new Plugin({
            view() {
                return {
                    update(view) {
                        if (!isSettled) return;
                        if (getUserInteractionEpoch() === interactionEpochAtCreate) return;
                        const doc = view.state.doc;
                        if (prevDoc !== null && doc.eq(prevDoc)) return;
                        prevDoc = doc;
                        onDocumentChanged();
                    },
                };
            },
        }),
    );

    // ── CrepeBuilder ──────────────────────────────────────────────────────────
    const crepe = new CrepeBuilder({
        root: container,
        defaultValue: initialMarkdown,
    });

    // Phase 3: 启用 Crepe 原生功能（替换自定义实现 + 新增能力）
    // ── 主题切换总线 ────────────────────────────────────────
    // 初始主题取主题总线当前值（回归：此前硬编码 isDark=true 但传给 CodeMirror 的
    // 初始 extension 是亮色，靠下方的观察器兜底修正）
    let isDark = isDarkTheme();
    const cmTheme = new Compartment();
    // 主题 extension 缓存：每次调用新建对象会让 Compartment.reconfigure 全量重算
    // 并触发 CM 重渲染（放大下方观察器的回环）
    const CM_THEME_EXT = { dark: oneDark, light: syntaxHighlighting(defaultHighlightStyle) };
    const getCMTheme = (dark: boolean) => (dark ? CM_THEME_EXT.dark : CM_THEME_EXT.light);

    const reconfigureAllCM = () => {
        document.querySelectorAll(".cm-editor").forEach((el) => {
            const v = CMEditorView.findFromDOM(el as HTMLElement);
            if (v) v.dispatch({ effects: cmTheme.reconfigure(getCMTheme(isDark)) });
        });
    };

    // 新 CodeMirror 编辑器补配主题：只在 .cm-editor 数量变化时触发（回环防护见
    // utils/cmThemeObserver.ts 注释——此前任何 DOM 变更都排一次重配，重配自身又
    // 产生 DOM 变更，形成 10ms 一次的无限回环）
    _disconnectCmObserver?.();
    _disconnectCmObserver = observeCmEditorCount(container, reconfigureAllCM);

    // 主题切换：CodeMirror + Mermaid 全部统一处理
    const mermaidCodeMap = new Map<string, string>();
    let mermaidSeq = 0;

    // ── Mermaid 惰性加载 ────────────────────────────────────────────────
    // 首帧性能：mermaid 系（core + parser + cytoscape + 各 diagram）是 webview 包
    // 最大单一依赖，静态 import 会把 ~1.3MB（压缩口径）压进入口。改为首个 mermaid
    // 代码块渲染时才加载；主题切换在未加载时只记录目标主题，加载时统一初始化。
    let _mermaidModule: typeof import("mermaid").default | null = null;
    let _mermaidThemeInitializedFor: boolean | null = null;

    /** mermaid 初始化配置（主题随明暗切换；错误渲染策略固定） */
    function mermaidInitConfig(dark: boolean): Parameters<NonNullable<typeof _mermaidModule>["initialize"]>[0] {
        return {
            startOnLoad: false,
            theme: dark ? "dark" : "default",
            // 语法错误时**不要**画 mermaid 自带的「炸弹 + Syntax error in text」大图：
            // 那段 SVG 是 mermaid 在 render() 内部插入 <body> 的临时元素，我们修改不了
            // 它的位置与尺寸，它会滞留在文档最底部（回归：真机截图里文档末尾出现一张
            // 占满宽度的红色炸弹图）。置 true 后 mermaid 抛错，由下方 catch 在**代码块
            // 自己的预览区**显示一行简洁错误，错误位置正确、不污染页面。
            suppressErrorRendering: true,
        };
    }

    async function loadMermaid(): Promise<typeof import("mermaid").default> {
        if (!_mermaidModule) {
            const mod = await import("mermaid");
            _mermaidModule = mod.default;
        }
        if (_mermaidThemeInitializedFor !== isDark) {
            _mermaidModule.initialize(mermaidInitConfig(isDark));
            _mermaidThemeInitializedFor = isDark;
        }
        return _mermaidModule;
    }

    const renderMermaid = async (code: string): Promise<string> => {
        const id = "mermaid-" + Math.random().toString(36).slice(2, 8);
        const mermaid = await loadMermaid();
        const { svg } = await mermaid.render(id, code);
        return svg;
    };

    _unsubscribeTheme = onThemeChange((dark) => {
        isDark = dark;
        // 重绘已有 mermaid 预览（仅 mermaid 已加载时——未加载说明尚无预览可重绘，
        // 主题偏好由 loadMermaid 在首次渲染时套用）
        if (_mermaidModule) {
            _mermaidModule.initialize(mermaidInitConfig(dark));
            _mermaidThemeInitializedFor = dark;
            mermaidCodeMap.forEach((code, key) => {
                const el = document.querySelector<HTMLElement>(`[data-mermaid-key="${key}"]`);
                if (el) renderMermaid(code).then((svg) => {
                    el.innerHTML = svg;
                    const svgEl = el.querySelector<SVGElement>("svg");
                    if (svgEl) enhanceMermaidPreview(el, svgEl);
                }).catch(() => { /* 单图渲染失败不影响其他图与主题切换（错误图保持旧内容） */ });
            });
        }
        // 重配 CodeMirror
        reconfigureAllCM();
    });

    // Mermaid 预览渲染
    const renderPreview = (lang: string, code: string, apply: (v: null | string | HTMLElement) => void) => {
        // LaTeX 代码块预览：vendor/latexFeature 的惰性 KaTeX 异步渲染
        // （vendor 不 import codeBlockConfig——pnpm peer 变体下其 SliceType 符号分裂，
        // 跨上下文 update 会 contextNotFound；统一走本文件的 renderPreview）
        if (lang.toLowerCase() === "latex" && code.length > 0) {
            renderLatexPreview(code, apply);
            return null;
        }
        if (lang.toLowerCase() !== "mermaid") return null;
        const key = `m-${++mermaidSeq}`;
        // 键按「DOM 里是否还有对应节点」回收：在 mermaid 块里每敲一个字符上游就会用新的
        // text.value 触发一次 renderPreview，旧键随之失去节点（apply 已替换 DOM）。原实现
        // 只增不删，主题切换的 forEach 会对全部历史键各做一次 document.querySelector——
        // 查询次数随编辑次数无界增长。这里顺手清掉查不到节点的键（保留仍有效的 =
        // 文档里其他 mermaid 块，主题切换要重绘它们）。
        for (const oldKey of mermaidCodeMap.keys()) {
            if (oldKey !== key && !document.querySelector(`[data-mermaid-key="${oldKey}"]`)) {
                mermaidCodeMap.delete(oldKey);
            }
        }
        mermaidCodeMap.set(key, code);
        apply(`<div data-mermaid-key="${key}"></div>`);
        const el = () => document.querySelector<HTMLElement>(`[data-mermaid-key="${key}"]`);
        renderMermaid(code).then((svg) => {
            const e = el();
            if (!e) return;
            e.innerHTML = svg;
            const svgEl = e.querySelector<SVGElement>("svg");
            if (svgEl) enhanceMermaidPreview(e, svgEl);
        }).catch((err) => {
            console.warn('[mermaid] render failed:', err);
            const e = el();
            if (e) e.innerHTML = `<span style="color:var(--vscode-errorForeground)">Mermaid: ${err}</span>`;
        });
    };

    crepe
        .addFeature(codeMirror, {
            languages: codeLanguages,
            theme: cmTheme.of(getCMTheme(isDark)),
            renderPreview,
            searchPlaceholder: t('Search language...'),
        })
        .addFeature(listItem)
        .addFeature(topBar, {
            headingOptions: [
                { label: 'P', level: null },
                { label: 'H1', level: 1 },
                { label: 'H2', level: 2 },
                { label: 'H3', level: 3 },
                { label: 'H4', level: 4 },
                { label: 'H5', level: 5 },
                { label: 'H6', level: 6 },
            ],
            buildTopBar: (builder) => buildTopBarConfig(builder, onTocToggle),
        })
        .addFeature(toolbar)
        .addFeature(table)
        .addFeature(latexFeature)   // 本地惰性 KaTeX 实现（替代上游 latex）
        .addFeature(linkTooltip)
    // 已启用：feature/toolbar → 选中文字浮动工具栏

    // 恢复行内代码 mark 的 inclusive：7.22.1（#2451）改为 false，块尾输入即退出
    // 代码 span——epytor 的 ./ @/ 路径补全依赖在行内代码尾部继续编辑，
    // 恢复 7.22.0 行为（退出用方向键/点击明确操作）
    crepe.editor.use(
        inlineCodeSchema.extendSchema((prev) => (ctx) => ({ ...prev(ctx), inclusive: true })),
    );

    // 光标插件独立注册：官方 cursor 插件（drop indicator）+ 默认行为虚拟光标。
    // 回归：Crepe cursor feature 的 createVirtualCursor 带 skipWarning:['inlineCode']
    // （7.22.1 为 inclusive:false 设计）；epytor 恢复 inclusive:true 后仍跳过警告，
    // 导致行内代码边界的方向指示消失、方向键无法退出——自注册默认行为（7.22.0 一致）
    crepe.editor.use(cursor);
    crepe.editor.use($prose(() => createVirtualCursor()));

    // 撤销粒度：每次输入一步（默认 500ms 合并窗会把连续输入并成一次撤销，
    // 用户无法预知一次 Ctrl+Z 撤掉多少）。IME 组合内部仍按组合 ID 合并——
    // 一段候选提交 = 一步，不会撤到拼音中间态；新一段候选（组合 ID 变化）
    // 与前一次输入各自成步，撤销不会连带撤掉上一步。
    crepe.editor.use($prose(() => {
        let prevComposition: unknown = null;
        return new Plugin({
            filterTransaction(tr) {
                if (!tr.docChanged) { return true; }
                const composition = tr.getMeta("composition") ?? null;
                if (composition === null || composition !== prevComposition) { closeHistory(tr); }
                prevComposition = composition;
                return true;
            },
        });
    }));

    // 注入保留的自定义配置
    crepe.editor
        .config((ctx) => {
            _savedMarkdown = initialMarkdown;

            // 表格单元格内 Shift+Enter 软换行由 softBreakKeymap 负责（见其文件头：
            // 上游命令在行尾已有 hardbreak 时会「转段落」，表格内反直觉，故不采用）。
            // 代码块内的 Shift+Enter 仍走上游默认（softBreakKeymap 返回 false 放行）。

            // Milkdown 的默认 text handler 会对普通文本中的 `_`、`*`、`[`
            // 过度转义。保留其上下文安全规则，只在 Clean 模式放宽已知误报。
            ctx.update(remarkStringifyOptionsCtx, (options) => {
                const compatibleTextHandler = options.handlers?.text;
                if (!compatibleTextHandler) return options;
                // 列表标记符沿用文件自己的写法（回归：默认 `*` 会把用户的 `- item`、
                // `1) item` 在保存时改写掉）。两种序列化模式共用——它与 clean/compatible
                // 的差别（转义与表格换行）无关，属于「不改用户原文」的保真项。
                const markers = detectListMarkerStyle(_savedMarkdown ?? initialMarkdown);
                // 表格单元格内换行：mdast 默认 handler 在表格上下文退化为空格，
                // 覆盖为 GFM 标准 <br>（两种序列化模式均生效，见 withTableBreakHandler）
                return withTableBreakHandler({
                    ...options,
                    bullet: markers.bullet,
                    bulletOrdered: markers.ordered,
                    handlers: {
                        ...options.handlers,
                        text: (node, parent, state, info) => {
                            if (_serializationMode === "compatible") {
                                return compatibleTextHandler(node, parent, state, info);
                            }
                            return cleanTextHandler(node, parent, state, info);
                        },
                    },
                });
            });

            // 注册自定义 image / 行内公式 NodeView（行内公式为惰性 KaTeX：
            // 占位展示源码，katex 就绪后异步渲染，见 vendor/latexFeature.ts）
            ctx.set(nodeViewCtx, [
                [
                    "image",
                    (node, view, getPos) =>
                        createImageView(node, view, getPos, undefined, undefined, onRenameImage),
                ],
                [
                    "math_inline",
                    (node) => createMathInlineView(node),
                ],
            ]);

        })
        .use(updateNotifyPlugin)    // 文档变更轻量通知（保存时拉取序列化，输入期间零序列化）
        .use(formatKeymapPlugin)    // 保留：自定义格式化快捷键
        .use(headingFoldPlugin)     // 标题折叠（Decoration，不修改文档）
        .use(headingStickyPlugin)   // 标题吸顶条（滚动跟随 + 推挤过渡）
        .use(softBreakKeymap)       // Shift+Enter 软换行（表格内允许；见文件头回归说明）
        .use(cellClickFixPlugin)    // 表格单击→光标定位，拖拽→多选
        .use(listBackspacePlugin)   // 列表项行首 Backspace 的落点（见 utils/listBackspace.ts）
        .use(taskListItemEnterPlugin) // 任务项回车新建项默认未勾选（见 utils/taskListItemEnter.ts）
        .use(listMarkerPlugin)      // Word 式多级列表标记（见 listMarkers.css 与同名 spec）
        .use(emptyTaskListItemRemark) // 空任务项（`- [ ] `）识别（见 utils/emptyTaskListItem.ts）
        .use(listSpreadNormalizePlugin); // 保留：列表 spread 规范化

    _editor = await crepe.create();
    isSettled = true;
    // 首帧基准：settle 后用户首个交互事务（点击定位光标等纯选区 dispatch）与基准
    // doc 相同即不通知（回归：prevDoc=null 使首事务无条件误发脏标记，未编辑就出 ● 圆点）
    prevDoc = _editor.action((ctx) => ctx.get(editorViewCtx)).state.doc;
    // 未编辑保存的判据基准：载入/重建后的文档就是磁盘内容的等价物
    _savedDoc = prevDoc;
    return _editor;
}
