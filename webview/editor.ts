
import {
    Editor,
    editorViewCtx,
    nodeViewCtx,
    remarkStringifyOptionsCtx,
    schemaCtx,
} from "@milkdown/kit/core";
import { emphasisSchema, inlineCodeSchema, strongSchema } from "@milkdown/kit/preset/commonmark";
import { strikethroughSchema } from "@milkdown/kit/preset/gfm";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { closeHistory } from "@milkdown/kit/prose/history";
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose, $remark } from "@milkdown/kit/utils";
import { CrepeBuilder } from "@milkdown/crepe";
import { linkTooltip } from "@milkdown/crepe/feature/link-tooltip";
import { codeMirror } from "@milkdown/crepe/feature/code-mirror";
import { cursor } from "@milkdown/kit/plugin/cursor";
import { createVirtualCursor } from "./vendor/prosemirrorVirtualCursor";

import { latexFeature, createMathInlineView, renderLatexPreview } from "./vendor/latexFeature";
import { listItem } from "@milkdown/crepe/feature/list-item";
import { table } from "@milkdown/crepe/feature/table";
import { topBar } from "@milkdown/crepe/feature/top-bar";
import { buildTopBarConfig } from "./components/topBar/buildTopBar";
import { toolbar } from "@milkdown/crepe/feature/toolbar";
import { LanguageDescription, type LanguageSupport } from "@codemirror/language";
import { languages as allCodeLanguages } from "@codemirror/language-data";
import { onThemeChange, isDarkTheme } from "./editor/themeBus";
import { changeRangeInFinalDoc, normalizeListSpread } from "./markdown/listSpread";
import { listBackspacePlugin } from "./markdown/listBackspace";
import { imeCaretGuardPlugin } from "./editor/plugins/imeCaretGuardPlugin";
import { taskListItemEnterPlugin } from "./markdown/taskListItemEnter";
import { listMarkerPlugin } from "./editor/plugins/listMarkerPlugin";
import { formatKeymapPlugin } from "./editor/plugins/formatKeymapPlugin";
import { getUserInteractionEpoch } from "./shell/userInteraction";
import { t } from "./i18n";
import { createImageView } from "./components/imageView";
import { cellClickFixPlugin } from "./editor/plugins/cellClickFixPlugin";
import { headingFoldPlugin } from "./editor/plugins/headingFoldPlugin";
import { headingStickyPlugin } from "./editor/plugins/headingStickyPlugin";
import { softBreakKeymap } from "./editor/plugins/softBreakKeymap";
import type { TextSelectionRange } from "./app/rebuildRestore";
import { emptyTaskListItemPlugin } from "./markdown/emptyTaskListItem";
import {
    cleanTextHandler,
    detectListMarkerStyle,
    withTableBreakHandler,
    type SerializationMode,
} from "./markdown/markdownSerializer";
import { createEditorSession } from "./editor/editorSession";
import {
    captureContinuity,
    restoreContinuity,
    restoreSelection,
    type EditorContinuity,
} from "./editor/continuity";
import { createMermaidPreview } from "./editor/mermaidPreview";
import { createCodeBlockPreview } from "./editor/codeBlockPreview";
import { createCmTheme } from "./editor/cmTheme";

const emptyTaskListItemRemark = $remark("epytorEmptyTaskListItem", () => emptyTaskListItemPlugin);

const WANTED_LANGS = new Set([
    "bash", "sh", "c", "cpp", "c++", "csharp", "c#", "css", "go", "html",
    "java", "javascript", "js", "json", "kotlin", "latex", "less", "lua",
    "markdown", "md", "mermaid", "php", "python", "py", "ruby", "rust",
    "sass", "scss", "sql", "swift", "toml", "typescript", "ts", "xml", "yaml", "yml",
]);
const codeLanguages = allCodeLanguages.filter(
    (l: { alias: readonly string[] }) => l.alias.some((a) => WANTED_LANGS.has(a))
);

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

const editorSession = createEditorSession();

export function setSerializationMode(mode: SerializationMode): void {
    editorSession.setSerializationMode(mode);
}

export function getSerializationMode(): SerializationMode {
    return editorSession.getSerializationMode();
}

export function getMarkdownForSave(): string {
    return editorSession.getMarkdownForSave();
}

export function getEditorView(): EditorView | null {
    return editorSession.getView();
}

export function adoptDiskContentAsBaseline(content: string): void {
    editorSession.adoptDiskContentAsBaseline(content);
}

export function destroyEditor(): void {
    editorSession.destroy();
}

export type { EditorContinuity };

export function captureEditorContinuity(): EditorContinuity | null {
    const view = editorSession.getView();
    return view ? captureContinuity(view) : null;
}

export function restoreEditorContinuity(
    continuity: EditorContinuity,
    options: { isActivePanel: boolean },
): boolean {
    const view = editorSession.getView();
    return view ? restoreContinuity(view, continuity, options) : false;
}

export function restoreSavedSelection(selection: TextSelectionRange): boolean {
    const view = editorSession.getView();
    return view ? restoreSelection(view, selection) : false;
}

export async function createEditor(
    container: HTMLElement,
    initialMarkdown: string,
    onDocumentChanged: () => void,
    onRenameImage?: (webviewUri: string, newBasename: string) => Promise<void>,
    onTocToggle?: () => void,
): Promise<Editor> {

    const interactionEpochAtCreate = getUserInteractionEpoch();

    let isSettled = false;

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

    const crepe = new CrepeBuilder({
        root: container,
        defaultValue: initialMarkdown,
    });

    let isDark = isDarkTheme();

    editorSession.setCmObserverDisconnect(null);
    const cmTheme = createCmTheme(container, () => isDark);
    editorSession.setCmObserverDisconnect(cmTheme.dispose);
    const mermaidPreview = createMermaidPreview(() => isDark);
    editorSession.setThemeUnsubscribe(onThemeChange((dark) => {
        isDark = dark;
        mermaidPreview.applyTheme();
        cmTheme.reconfigureAll();
    }));

    const renderPreview = createCodeBlockPreview({
        renderLatex: renderLatexPreview,
        mermaidPreview,
    });

    crepe
        .addFeature(codeMirror, {
            languages: codeLanguages,
            theme: cmTheme.compartment.of(cmTheme.initialExtension()),
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
        .addFeature(latexFeature)
        .addFeature(linkTooltip);

    crepe.editor.use(
        inlineCodeSchema.extendSchema((prev) => (ctx) => ({ ...prev(ctx), inclusive: true })),
    );

    crepe.editor.use(
        strongSchema.extendSchema((prev) => (ctx) => ({ ...prev(ctx), inclusive: false })),
    );
    crepe.editor.use(
        emphasisSchema.extendSchema((prev) => (ctx) => ({ ...prev(ctx), inclusive: false })),
    );
    crepe.editor.use(
        strikethroughSchema.extendSchema((prev) => (ctx) => ({ ...prev(ctx), inclusive: false })),
    );

    crepe.editor.use(cursor);
    crepe.editor.use($prose(() => createVirtualCursor({ skipWarning: ["strong", "emphasis", "strike_through"] })));

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

    crepe.editor.use(imeCaretGuardPlugin);

    crepe.editor
        .config((ctx) => {
            editorSession.snapshot.seedMarkdown(initialMarkdown);

            ctx.update(remarkStringifyOptionsCtx, (options) => {
                const compatibleTextHandler = options.handlers?.text;
                if (!compatibleTextHandler) return options;

                const markers = detectListMarkerStyle(editorSession.snapshot.markdown);

                return withTableBreakHandler({
                    ...options,
                    bullet: markers.bullet,
                    bulletOrdered: markers.ordered,
                    handlers: {
                        ...options.handlers,
                        text: (node, parent, state, info) => {
                            if (editorSession.getSerializationMode() === "compatible") {
                                return compatibleTextHandler(node, parent, state, info);
                            }
                            return cleanTextHandler(node, parent, state, info);
                        },
                    },
                });
            });

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
        .use(updateNotifyPlugin)
        .use(formatKeymapPlugin)
        .use(headingFoldPlugin)
        .use(headingStickyPlugin)
        .use(softBreakKeymap)
        .use(cellClickFixPlugin)
        .use(listBackspacePlugin)
        .use(taskListItemEnterPlugin)
        .use(listMarkerPlugin)
        .use(emptyTaskListItemRemark)
        .use(listSpreadNormalizePlugin);

    const editor = await crepe.create();
    editorSession.setEditor(editor);
    isSettled = true;

    prevDoc = editor.action((ctx) => ctx.get(editorViewCtx)).state.doc;
    editorSession.snapshot.seedDoc(prevDoc);
    return editor;
}

