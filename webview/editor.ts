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
} from "@milkdown/kit/preset/commonmark";
import { toggleStrikethroughCommand } from "@milkdown/kit/preset/gfm";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import type { EditorView } from "@milkdown/kit/prose/view";
import { undo, redo } from "@milkdown/kit/prose/history";
import { keymap } from "@milkdown/kit/prose/keymap";
import { Plugin, NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import { liftListItem } from "@milkdown/kit/prose/schema-list";
import { lift, wrapIn } from "prosemirror-commands";
import { CellSelection, TableMap } from "@milkdown/kit/prose/tables";
import { $prose } from "@milkdown/kit/utils";
import { CrepeBuilder } from "@milkdown/crepe";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
import { TbUndo, TbRedo, TbImage, TbEraser, TbGear, TbToc } from "./ui/icons";

// 调试日志开关（由 index.ts setDebugMode 消息驱动）
let logTableSel = false;
export function setLogTableSel(enabled: boolean): void {
    logTableSel = enabled;
}

// ─── Crepe 原生功能 ──────────────────────────────────────────────────────────
// 以下 feature 由 @milkdown/crepe 官方维护，替换我们的自定义实现：
//   feature/table       → 替换 addButtons + handles + toolbar（1,562 行）
//   feature/code-mirror → 替换 codeBlock NodeView + Prism（1,909 行）
//   feature/toolbar     → 选中文字浮动工具栏（启用）
//   feature/latex       → 全新：KaTeX 数学公式支持
// feature/code-mirror → 换回自定义实现（复制反馈、全屏、样式更精致）
import { codeMirror } from "@milkdown/crepe/feature/code-mirror";
import { cursor } from "@milkdown/crepe/feature/cursor";
import { latex } from "@milkdown/crepe/feature/latex";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { table } from "@milkdown/crepe/feature/table";
import { topBar } from "@milkdown/crepe/feature/top-bar";
import { toolbar } from "@milkdown/crepe/feature/toolbar";
import { Compartment } from "@codemirror/state";
import { EditorView as CMEditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages as allCodeLanguages } from "@codemirror/language-data";
import mermaid from "mermaid";
import { onThemeChange } from "./utils/themeBus";
import { t } from "./i18n";

// 只保留常用语言（143 → ~40）
const WANTED_LANGS = new Set([
    "bash", "sh", "c", "cpp", "c++", "csharp", "c#", "css", "go", "html",
    "java", "javascript", "js", "json", "kotlin", "latex", "less", "lua",
    "markdown", "md", "mermaid", "php", "python", "py", "ruby", "rust",
    "sass", "scss", "sql", "swift", "toml", "typescript", "ts", "xml", "yaml", "yml",
]);
const codeLanguages = allCodeLanguages.filter(
    (l: { alias: string[] }) => l.alias.some((a) => WANTED_LANGS.has(a))
);
// Mermaid 不在 @codemirror/language-data 中，手动添加（仅标签，无语法高亮）
codeLanguages.unshift({
    name: "Text",
    alias: ["text", "plaintext", "txt"],
    extensions: ["txt"],
    load: async () => undefined,
});
codeLanguages.push({
    name: "Mermaid",
    alias: ["mermaid"],
    extensions: ["mmd"],
    load: async () => undefined,
});
// feature/toolbar 暂不启用（与自定义工具栏冲突）

// ─── 保留的自定义插件 ────────────────────────────────────────────────────────
// 以下插件 Crepe 不提供对应功能，永久保留：
//   listLiftPlugin           → 列表 backspace 上升一级
//   listSpreadNormalizePlugin → 列表 spread 规范化
//   selectionPlugin          → 选区变更回调（驱动外部 UI）
//   formatKeymapPlugin       → 自定义格式化快捷键

// 列表 Backspace：光标在行首时，层级 ≥2 → 上升一级；层级 1 → 同样上升（变为普通段落）
const listLiftPlugin = $prose((ctx) => {
    const schema = ctx.get(schemaCtx);
    const listItemType = schema.nodes["list_item"];
    if (!listItemType) {
        return new Plugin({});
    }
    const doLift = liftListItem(listItemType);
    return keymap({
        Backspace: (state, dispatch) => {
            const { selection } = state;
            if (!selection.empty) return false;
            const { $from } = selection;
            if ($from.parentOffset !== 0) return false;
            let inList = false;
            for (let d = $from.depth; d >= 0; d--) {
                if ($from.node(d).type === listItemType) { inList = true; break; }
            }
            if (!inList) return false;
            return doLift(state, dispatch);
        },
    });
});

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

// 选区变更回调（由 index.ts 注入，用于驱动工具栏等外部 UI）
let _onSelectionChange: ((view: EditorView) => void) | null = null;
export function registerSelectionChangeHandler(cb: (view: EditorView) => void): void {
    _onSelectionChange = cb;
}

const selectionPlugin = $prose(
    () =>
        new Plugin({
            view: () => ({
                update(view, prevState) {
                    if (
                        _onSelectionChange &&
                        (!view.state.selection.eq(prevState.selection) ||
                         !view.state.doc.eq(prevState.doc))
                    ) {
                        _onSelectionChange(view);
                    }
                },
            }),
        }),
);

// 列表 spread 规范化：编辑后若列表项只含单个块级子节点，自动将 spread 重置为 false
const listSpreadNormalizePlugin = $prose((ctx) => {
    const schema = ctx.get(schemaCtx);
    return new Plugin({
        appendTransaction(transactions, _oldState, newState) {
            if (!transactions.some((tr) => tr.docChanged)) return null;
            let minFrom = newState.doc.content.size;
            let maxTo = 0;
            for (const tr of transactions) {
                if (!tr.docChanged) continue;
                for (const step of tr.steps) {
                    step.getMap().forEach((_os, _oe, newStart, newEnd) => {
                        if (newStart < minFrom) minFrom = newStart;
                        if (newEnd > maxTo) maxTo = newEnd;
                    });
                }
            }
            if (minFrom > maxTo) return null;
            const tr = newState.tr;
            let changed = false;
            newState.doc.nodesBetween(minFrom, maxTo, (node, pos) => {
                if (node.type !== schema.nodes.bullet_list && node.type !== schema.nodes.ordered_list)
                    return;
                let listNeedsSpread = false;
                let offset = 1;
                node.forEach((item) => {
                    const itemNeedsSpread = item.childCount > 1;
                    if (item.attrs.spread !== itemNeedsSpread) {
                        tr.setNodeMarkup(pos + offset, undefined, { ...item.attrs, spread: itemNeedsSpread });
                        changed = true;
                    }
                    if (itemNeedsSpread) listNeedsSpread = true;
                    offset += item.nodeSize;
                });
                if (node.attrs.spread !== listNeedsSpread) {
                    tr.setNodeMarkup(pos, undefined, { ...node.attrs, spread: listNeedsSpread });
                    changed = true;
                }
            });
            return changed ? tr : null;
        },
    });
});

// ─── 表格单元格点击修正 ──────────────────────────────────────────────────────

function getCellCoords(doc: any, pos: number): { row: number; col: number } | null {
    try {
        const $pos = doc.resolve(pos);
        for (let d = $pos.depth; d >= 0; d--) {
            const typeName = $pos.node(d).type.name;
            if (typeName === "table_cell" || typeName === "table_header") {
                for (let td = d - 1; td >= 0; td--) {
                    if ($pos.node(td).type.name === "table") {
                        const tableNode = $pos.node(td);
                        const tableStart = $pos.start(td);
                        const cellRelPos = $pos.before(d) - tableStart;
                        const map = TableMap.get(tableNode);
                        const rect = map.findCell(cellRelPos);
                        return { row: rect.top + 1, col: rect.left + 1 };
                    }
                }
            }
        }
    } catch {}
    return null;
}

const cellClickFixPlugin = $prose(() => {
    let pendingClickPos: number | null = null;
    let cellClickTarget: number | null = null; // 表格单击位置，不受 mouseup 清理影响
    let clickIsPlain = true;
    let wasCrossCell = false;
    let lastGoodCellSelection: CellSelection | null = null;
    let multiSelectCount = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let capturedView: EditorView | null = null;

    return new Plugin({
        view(editorView) {
            capturedView = editorView;
            return { destroy() { capturedView = null; } };
        },
        props: {
            handleDOMEvents: {
                mousedown: (view, event) => {
                    if (event.button !== 0 || event.detail !== 1 || event.shiftKey || event.ctrlKey || event.metaKey) {
                        pendingClickPos = null;
                        return false;
                    }
                    const cell = (event.target as Element).closest("td, th");
                    if (!cell) { pendingClickPos = null; return false; }
                    const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
                    pendingClickPos = pos ? pos.pos : null;
                    cellClickTarget = pos ? pos.pos : null;
                    clickIsPlain = true;
                    wasCrossCell = false;
                    lastGoodCellSelection = null;
                    lastMouseX = event.clientX;
                    lastMouseY = event.clientY;

                    const onMove = (mv: MouseEvent) => {
                        lastMouseX = mv.clientX;
                        lastMouseY = mv.clientY;
                        if (Math.abs(mv.clientX - event.clientX) + Math.abs(mv.clientY - event.clientY) > 4) clickIsPlain = false;
                    };
                    document.addEventListener("mousemove", onMove, true);

                    const cleanup = () => {
                        document.removeEventListener("mouseup", cleanup, true);
                        document.removeEventListener("mousemove", onMove, true);
                        if (wasCrossCell) {
                            pendingClickPos = null;
                            clickIsPlain = true;
                            wasCrossCell = false;
                            const savedCellSel = lastGoodCellSelection;
                            setTimeout(() => { if (lastGoodCellSelection === savedCellSel) lastGoodCellSelection = null; }, 200);
                        } else {
                            Promise.resolve().then(() => { pendingClickPos = null; clickIsPlain = true; });
                        }
                    };
                    document.addEventListener("mouseup", cleanup, true);
                    return false;
                },
            },
        },
        filterTransaction(tr, state) {
            // 原生表格单击→NodeSelection（单元格内段落）→拦截并转为光标定位
            if (tr.selection instanceof NodeSelection) {
                try {
                    const $pos = state.doc.resolve(Math.min(tr.selection.from, state.doc.content.size));
                    for (let d = $pos.depth; d >= 0; d--) {
                        const t = $pos.node(d).type.name;
                        if (t === "table_cell" || t === "table_header") {
                            // 在 Crepe rAF 内被拦截；再套一层 rAF 补 TextSelection
                            const clickPos = cellClickTarget;
                            cellClickTarget = null;
                            requestAnimationFrame(() => {
                                const v = capturedView;
                                if (!v) return;
                                const sel = v.state.selection;
                                if (sel instanceof TextSelection && sel.from === sel.to) return; // 已有光标
                                try {
                                    const p = Math.min(clickPos ?? tr.selection.from, v.state.doc.content.size);
                                    v.dispatch(v.state.tr.setSelection(TextSelection.near(v.state.doc.resolve(p))));
                                } catch { /* ignore */ }
                            });
                            return false;
                        }
                    }
                } catch { /* ignore */ }
            }
            if (!lastGoodCellSelection) return true;
            if (state.selection instanceof CellSelection && !(tr.selection instanceof CellSelection)) {
                return false;
            }
            return true;
        },
        appendTransaction(_trs, _oldState, newState) {
            if (pendingClickPos === null) return null;
            const sel = newState.selection;
            const $pos = newState.doc.resolve(Math.min(pendingClickPos, newState.doc.content.size));

            // 单格 CellSelection → 转 TextSelection
            if (sel instanceof CellSelection) {
                if (sel.isRowSelection() || sel.isColSelection()) return null;
                if (sel.$anchorCell.pos !== sel.$headCell.pos) {
                    wasCrossCell = true;
                    lastGoodCellSelection = sel;
                    return null;
                }
                try {
                    if (!clickIsPlain && capturedView) {
                        const toCoords = capturedView.posAtCoords({ left: lastMouseX, top: lastMouseY });
                        if (toCoords) {
                            const headP = Math.min(toCoords.pos, newState.doc.content.size);
                            try {
                                const $a = newState.doc.resolve(Math.min(pendingClickPos, newState.doc.content.size));
                                const $h = newState.doc.resolve(headP);
                                let aCellStart = -1, hCellStart = -1;
                                for (let d = $a.depth; d >= 0; d--) { if ($a.node(d).type.name === "table_cell" || $a.node(d).type.name === "table_header") { aCellStart = $a.start(d); break; } }
                                for (let d = $h.depth; d >= 0; d--) { if ($h.node(d).type.name === "table_cell" || $h.node(d).type.name === "table_header") { hCellStart = $h.start(d); break; } }
                                if (aCellStart !== hCellStart) return null;
                            } catch { /* ignore */ }
                            return newState.tr.setSelection(TextSelection.create(newState.doc, headP, Math.min(pendingClickPos, newState.doc.content.size)));
                        }
                    }
                    return newState.tr.setSelection(TextSelection.near($pos));
                } catch { return null; }
            }

            return null;
        },
    });
});

// ─── 比较规范化辅助函数 ─────────────────────────────────────────────────────

const SEP_ROW_RE  = /^\|[\s\-:|]+\|$/;
const TABLE_ROW_RE = /^\|.*\|$/;

function normalizeSepRow(line: string): string {
    const t = line.trim();
    const cells = t.split('|').slice(1, -1).map(c => {
        return c.trim().replace(/(:?)-+(:?)/g, (_: string, a: string, b: string) => (a ?? '') + '-' + (b ?? ''));
    });
    return '|' + cells.join('|') + '|';
}

function normalizeSplitStrong(line: string): string {
    let prev: string;
    do {
        prev = line;
        line = line.replace(
            /\*\*((?:[^*]|\*(?!\*))*)\*\* \*\*((?:[^*]|\*(?!\*))*)\*\*/g,
            '**$1 $2**',
        );
    } while (line !== prev);
    return line;
}

function normalizeTableDataRow(line: string): string {
    const t = line.trim();
    const cells = t.split('|').slice(1, -1).map(c => {
        const v = c.trim();
        return v === '<br />' ? '' : v;
    });
    return '|' + cells.join('|') + '|';
}

function normalizeFenceOpen(line: string): string {
    return line.replace(/^(\s*`{3,})\s+/, '$1');
}

function normLineForCompare(line: string): string {
    const t = line.trim();
    if (SEP_ROW_RE.test(t))   return normalizeSepRow(line);
    if (TABLE_ROW_RE.test(t)) return normalizeTableDataRow(line);
    if (/^`{3,}/.test(t))     return normalizeFenceOpen(line);
    return normalizeSplitStrong(line);
}

// ─── 最小化差异合并 ──────────────────────────────────────────────────────────
function applyMinimalChanges(saved: string, serialized: string): string {
    interface SigLine { text: string; lineIdx: number }

    function sigLines(md: string): SigLine[] {
        return md.split('\n').reduce<SigLine[]>((acc, line, i) => {
            if (line.trim() !== '') acc.push({ text: line, lineIdx: i });
            return acc;
        }, []);
    }

    const savedSig  = sigLines(saved);
    const serialSig = sigLines(serialized);
    const n = savedSig.length, m = serialSig.length;

    const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = 1; i <= n; i++)
        for (let j = 1; j <= m; j++)
            dp[i][j] = normLineForCompare(savedSig[i - 1].text) === normLineForCompare(serialSig[j - 1].text)
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);

    const keepMap = new Map<number, number>();
    {
        let i = n, j = m;
        while (i > 0 && j > 0) {
            if (normLineForCompare(savedSig[i - 1].text) === normLineForCompare(serialSig[j - 1].text)) {
                keepMap.set(serialSig[j - 1].lineIdx, savedSig[i - 1].lineIdx);
                i--; j--;
            } else if (dp[i][j - 1] >= dp[i - 1][j]) {
                j--;
            } else {
                i--;
            }
        }
    }

    if (keepMap.size === n && keepMap.size === m && saved.length === serialized.length) return saved;

    const savedLines = saved.split('\n');
    const serializedLines = serialized.split('\n');
    const result: string[] = [];
    for (let i = 0; i < serializedLines.length; i++) {
        const savedIdx = keepMap.get(i);
        if (savedIdx !== undefined) result.push(savedLines[savedIdx]);
        else result.push(serializedLines[i]);
    }
    return result.join('\n');
}

// ─── 自定义视图组件 ─────────────────────────────────────────

import { createImageView } from "./components/imageView";

// ─── 编辑器实例管理 ──────────────────────────────────────────────────────────

let _editor: Editor | null = null;
let _savedMarkdown = '';
let _hasUserInteracted = false;
let _interactionListenerAdded = false;

function setupInteractionTracking(): void {
    if (_interactionListenerAdded) return;
    _interactionListenerAdded = true;
    const mark = () => { _hasUserInteracted = true; };
    document.addEventListener('keydown',   mark, { capture: true });
    document.addEventListener('mousedown', mark, { capture: true });
    document.addEventListener('paste',     mark, { capture: true });
    document.addEventListener('drop',      mark, { capture: true });
    document.addEventListener('cut',       mark, { capture: true });
}

export function getEditorView(): EditorView | null {
    if (!_editor) return null;
    return _editor.action((ctx) => ctx.get(editorViewCtx));
}

export async function createEditor(
    container: HTMLElement,
    initialMarkdown: string,
    onUpdate: (markdown: string) => void,
    onRenameImage?: (webviewUri: string, newBasename: string) => Promise<void>,
    onTocToggle?: () => void,
): Promise<Editor> {
    _hasUserInteracted = false;
    setupInteractionTracking();

    let debounceTimer: ReturnType<typeof setTimeout>;
    let isComposing = false;
    let pendingMd: string | null = null;

    const fireUpdate = (md: string) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => onUpdate(md), 300);
    };
    const debouncedUpdate = (md: string) => {
        if (isComposing) { pendingMd = md; return; }
        fireUpdate(md);
    };

    container.addEventListener('compositionstart', () => { isComposing = true; });
    container.addEventListener('compositionend', () => {
        isComposing = false;
        if (pendingMd !== null) {
            const md = pendingMd;
            pendingMd = null;
            fireUpdate(md);
        }
    });

    let isSettled = false;

    // ── CrepeBuilder ──────────────────────────────────────────────────────────
    const crepe = new CrepeBuilder({
        root: container,
        defaultValue: initialMarkdown,
    });

    // Phase 3: 启用 Crepe 原生功能（替换自定义实现 + 新增能力）
    // ── 主题切换总线 ────────────────────────────────────────
    const cmTheme = new Compartment();
    const getCMTheme = (dark: boolean) => dark ? oneDark : syntaxHighlighting(defaultHighlightStyle);

    const reconfigureAllCM = () => {
        document.querySelectorAll(".cm-editor").forEach((el) => {
            const v = CMEditorView.findFromDOM(el as HTMLElement);
            if (v) v.dispatch({ effects: cmTheme.reconfigure(getCMTheme(isDark)) });
        });
    };

    // 监听新 CodeMirror 编辑器创建（补配主题）
    const cmObserver = new MutationObserver(() => {
        if (document.querySelector(".cm-editor")) setTimeout(reconfigureAllCM, 10);
    });
    cmObserver.observe(container, { childList: true, subtree: true });

    // 主题切换：CodeMirror + Mermaid 全部统一处理
    let isDark = true;
    const mermaidCodeMap = new Map<string, string>();
    let mermaidSeq = 0;

    const renderMermaid = (code: string): Promise<string> => {
        const id = "mermaid-" + Math.random().toString(36).slice(2, 8);
        return mermaid.render(id, code).then(({ svg }) => svg);
    };

    onThemeChange((dark) => {
        isDark = dark;
        mermaid.initialize({ startOnLoad: false, theme: dark ? "dark" : "default" });
        // 重绘已有 mermaid 预览
        mermaidCodeMap.forEach((code, key) => {
            const el = document.querySelector<HTMLElement>(`[data-mermaid-key="${key}"]`);
            if (el) renderMermaid(code).then((svg) => { el.innerHTML = svg; }).catch(() => {});
        });
        // 重配 CodeMirror
        reconfigureAllCM();
    });

    // Mermaid 预览渲染
    const renderPreview = (lang: string, code: string, apply: (v: string | null) => void) => {
        if (lang.toLowerCase() !== "mermaid") return null;
        const key = `m-${++mermaidSeq}`;
        mermaidCodeMap.set(key, code);
        apply(`<div data-mermaid-key="${key}"></div>`);
        const el = () => document.querySelector(`[data-mermaid-key="${key}"]`);
        renderMermaid(code).then((svg) => {
            const e = el();
            if (e) e.innerHTML = svg;
        }).catch((err) => {
            console.warn('[mermaid] render failed:', err);
            const e = el();
            if (e) e.innerHTML = `<span style="color:var(--vscode-errorForeground)">Mermaid: ${err}</span>`;
        });
    };

    crepe
        .addFeature(codeMirror, {
            languages: codeLanguages,
            theme: cmTheme.of(getCMTheme()),
            renderPreview,
            searchPlaceholder: t('Search language...'),
        })
        .addFeature(cursor)
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
            buildTopBar: (builder: any) => {
                // Undo/Redo — 最前面独立组
                builder.addGroup('history', '').addItem('undo', {
                    icon: TbUndo as any,
                    active: (ctx: any) => undo(ctx.get(editorViewCtx).state),
                    onRun: (ctx: any) => { const v = ctx.get(editorViewCtx); undo(v.state, v.dispatch, v); },
                } as any).addItem('redo', {
                    icon: TbRedo as any,
                    active: (ctx: any) => redo(ctx.get(editorViewCtx).state),
                    onRun: (ctx: any) => { const v = ctx.get(editorViewCtx); redo(v.state, v.dispatch, v); },
                } as any);
                // 清除格式 — formatting 组末尾（行内代码后面）
                builder.getGroup('formatting').addItem('clear-format', {
                    icon: TbEraser as any,
                    active: (ctx: any) => {
                        const v = ctx.get(editorViewCtx);
                        const { from, to, empty } = v.state.selection;
                        if (!empty) {
                            let has = false;
                            v.state.doc.nodesBetween(from, to, (n: any) => { if (n.marks.length) { has = true; return false; } return true; });
                            return has;
                        }
                        // 无选区时：光标在链接内即为 active
                        const linkType = v.state.schema.marks['link'];
                        if (!linkType) return false;
                        return linkType.isInSet(v.state.doc.resolve(from).marks()) !== undefined;
                    },
                    onRun: (ctx: any) => {
                        const v = ctx.get(editorViewCtx);
                        let { from, to, empty } = v.state.selection;
                        const tr = v.state.tr;
                        const linkType = v.state.schema.marks['link'];

                        // 光标在链接内（无选区）→ 取消整个链接
                        if (empty && linkType) {
                            const $from = v.state.doc.resolve(from);
                            if (linkType.isInSet($from.marks())) {
                                while (from > 0 && v.state.doc.rangeHasMark(from - 1, from, linkType)) from--;
                                const docSize = v.state.doc.content.size;
                                while (to < docSize && v.state.doc.rangeHasMark(to, to + 1, linkType)) to++;
                                tr.removeMark(from, to, linkType);
                                v.dispatch(tr);
                                return;
                            }
                        }

                        // 有选区 → 扩展链接边界后清除所有标记
                        if (linkType) {
                            while (from > 0 && v.state.doc.rangeHasMark(from - 1, from, linkType)) from--;
                            const docSize = v.state.doc.content.size;
                            while (to < docSize && v.state.doc.rangeHasMark(to, to + 1, linkType)) to++;
                        }

                        v.state.doc.nodesBetween(from, to, (n: any, pos: number) => {
                            if (n.marks.length) {
                                const s = Math.max(pos, from), e = Math.min(pos + n.nodeSize, to);
                                n.marks.forEach((m: any) => tr.removeMark(s, e, m.type));
                            }
                        });
                        if (linkType) tr.removeMark(from, to, linkType);
                        v.dispatch(tr);
                    },
                } as any);
                // 图片 — insert 组，link 和 table 之间（清空后按序重建）
                {
                    const g = builder.getGroup('insert'); const items = g.group.items;
                    const linkItem = items.find((i: any) => i.key === 'link');
                    const tableItem = items.find((i: any) => i.key === 'table');
                    g.clear();
                    if (linkItem) g.addItem('link', linkItem);
                    g.addItem('image', {
                        icon: TbImage as any,
                        active: () => false,
                        onRun: (ctx: any) => {
                            ctx.get(editorViewCtx).dom.dispatchEvent(new CustomEvent('epytor:insertImage', { bubbles: true }));
                        },
                    } as any);
                    if (tableItem) g.addItem('table', tableItem);
                }
                // 引用块一键退出：在引用内点击 → lift 解包，否则 → 包裹
                {
                    const isInBlockquote = (state: any) => {
                        const bqType = state.schema.nodes['blockquote'];
                        if (!bqType) return false;
                        const { $from } = state.selection;
                        for (let d = $from.depth; d >= 0; d--) {
                            if ($from.node(d).type === bqType) return true;
                        }
                        return false;
                    };

                    const moreG = builder.getGroup('more');
                    const moreItems = moreG.group.items;
                    const quoteItem = moreItems.find((i: any) => i.key === 'quote');
                    const hrItem = moreItems.find((i: any) => i.key === 'hr');
                    const quoteIcon = (quoteItem as any)?.icon;
                    moreG.clear();
                    moreG.addItem('quote', {
                        icon: quoteIcon,
                        active: (ctx: any) => isInBlockquote(ctx.get(editorViewCtx).state),
                        onRun: (ctx: any) => {
                            const v = ctx.get(editorViewCtx);
                            if (isInBlockquote(v.state)) {
                                lift(v.state, v.dispatch);
                            } else {
                                const bq = v.state.schema.nodes['blockquote'];
                                if (bq) wrapIn(bq)(v.state, v.dispatch);
                            }
                        },
                    } as any);
                    if (hrItem) moreG.addItem('hr', hrItem);
                }
                // 目录切换 — 设置前独立组
                builder.addGroup('toc', '').addItem('toc', {
                    icon: TbToc as any,
                    active: () => false,
                    onRun: () => {
                        onTocToggle?.();
                    },
                } as any);
                // 设置 — 末尾独立组
                builder.addGroup('settings', '').addItem('settings', {
                    icon: TbGear as any,
                    active: () => false,
                    onRun: () => {
                        document.dispatchEvent(new CustomEvent('epytor:openSettings', { bubbles: true }));
                    },
                } as any);
                // 将 toc、history 组移到最前面
                const groups = builder.build();
                const tocGroup = groups.find((g: any) => g.key === 'toc');
                if (tocGroup) {
                    const idx = groups.indexOf(tocGroup);
                    groups.splice(idx, 1);
                    groups.unshift(tocGroup);
                }
                const historyGroup = groups.find((g: any) => g.key === 'history');
                if (historyGroup) {
                    const idx = groups.indexOf(historyGroup);
                    groups.splice(idx, 1);
                    groups.splice(1, 0, historyGroup);
                }
            },
        })
        .addFeature(toolbar)
        .addFeature(table)
        .addFeature(latex)       // 全新：KaTeX 数学公式
        .addFeature(linkTooltip)
    // 已启用：feature/toolbar → 选中文字浮动工具栏

    // 注入保留的自定义配置
    crepe.editor
        .config((ctx) => {
            _savedMarkdown = initialMarkdown;

            // 注册自定义 image NodeView
            ctx.set(nodeViewCtx, [
                [
                    "image",
                    (node, view, getPos) =>
                        createImageView(node, view, getPos, undefined, undefined, onRenameImage),
                ],
            ]);

        })
        .use(listener)              // 追加 listener 用于 markdownUpdated
        .use(listLiftPlugin)        // 保留：列表 backspace
        .use(selectionPlugin)       // 保留：选区变更回调
        .use(formatKeymapPlugin)    // 保留：自定义格式化快捷键
        .use(cellClickFixPlugin)    // 表格单击→光标定位，拖拽→多选
        .use(listSpreadNormalizePlugin); // 保留：列表 spread 规范化

    // 注册 markdownUpdated 回调（自动保存链路）
    crepe.on((api) => {
        api.markdownUpdated((_ctx, markdown) => {
            if (!isSettled) return;
            if (!_hasUserInteracted) return;
            const toSave = applyMinimalChanges(_savedMarkdown, markdown);
            if (toSave === _savedMarkdown) return;
            _savedMarkdown = toSave;
            debouncedUpdate(toSave);
        });
    });

    _editor = await crepe.create();
    isSettled = true;
    return _editor;
}
