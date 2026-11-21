import "@milkdown/crepe/theme/classic-dark.css";
import "@milkdown/crepe/theme/common/prosemirror.css";
import "@milkdown/crepe/theme/common/reset.css";
import "@milkdown/crepe/theme/common/code-mirror.css";
import "@milkdown/crepe/theme/common/cursor.css";
import "@milkdown/crepe/theme/common/list-item.css";
import "@milkdown/crepe/theme/common/table.css";
import "@milkdown/crepe/theme/common/top-bar.css";
import "@milkdown/crepe/theme/common/toolbar.css";
import "@milkdown/crepe/theme/common/link-tooltip.css";

import "./latex.css";
import "./style.css";
import "./listMarkers.css";
import { switchTargetLine } from "./app/scrollSync";
import { resolveTableWrapVars } from "../shared/tableWrap";
import type { ToWebviewMessage } from "../shared/messages";
import { applyTableWrapVars } from "./table/tableWrap";
import { applyCodeBlockMaxHeight, applyEditorMaxWidth } from "./shell/layoutVars";
import { showNotice } from "./ui/notice";
import { computeAllHeadingSignature } from "./outline/headingFold";
import {
    createEditor,
    destroyEditor,
    getEditorView,
    getMarkdownForSave,
    setSerializationMode,
    captureEditorContinuity,
    restoreEditorContinuity,
    restoreSavedSelection,
    adoptDiskContentAsBaseline,
} from "./editor";
import { TextSelection } from "@milkdown/kit/prose/state";
import {
    notifyReady,
    notifyMarkDirty,
    notifyUnsavedContent,
    notifyContentResponse,
    notifyFrontmatterUpdate,
    onMessage,
    notifySwitchToTextEditor,
    notifyViewportLine,
    notifyWordCount,
    notifyOpenUrl,
    notifyOpenFile,
    notifyOpenSettings,
    getWebviewState,
    setWebviewState,
} from "./messaging";
import { setupPathLink } from "./components/pathLink";
import { initPathComplete } from "./components/pathLink/pathComplete";
import { dispatchImagePathResolved } from "./components/imageView/imgPathComplete";
import { resolvePathSuggestionRequest } from "./images/pathSuggestionRequests";
import { setImageUriMap, showGlobalLightbox } from "./components/imageView";
import { getUserInteractionEpoch } from "./shell/userInteraction";
import { createCompositionGate } from "./editor/compositionGate";
import { initViewportLedger } from "./scroll/viewportLedger";
import { initFindBar } from "./components/findBar";
import { initToc, setTocEditorMaxWidth } from "./components/toc";
import { installModifierKeyTracking } from "./ui/modifierKeys";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import { createFrontmatterPanel, type FrontmatterPanelHandle } from "./components/frontmatterPanel";
import { initTopBarOverflow } from "./components/topBarOverflow";
import { enhanceCodeBlocks, closeCodeBlockLightbox } from "./components/codeBlockEnhance";
import { closeTableGridPicker } from "./components/tableGridPicker";
import { closeImagePicker } from "./components/imagePicker";
import { setupTopBarBrand, setupTopBarTooltips } from "./components/topBar/topBarDecorations";
import { initSessionPersistence } from "./app/persistence";
import {
    createImageRequestController,
    initImageDropPaste,
    initImagePickerInsertion,
} from "./app/imageRequests";
import { initLinkBehavior } from "./app/linkBehavior";
import { createScrollTargets } from "./app/scrollTargets";

const MARK_DIRTY_DEBOUNCE_MS = 300;
const TOC_REFRESH_DEBOUNCE_MS = 800;

const INITIAL_SCROLL_TOP_DELAYS_MS = [0, 50, 150, 400];
const INITIAL_VIEWPORT_LINE_REPORT_DELAY_MS = 600;

let _topBarOverflowCtl: { dispose(): void } | null = null;

initViewportLedger();

let currentEditor: Editor | null = null;
let currentLineMap: number[] = [];
let currentLineEndMap: number[] = [];

let _lastNavLine: number | null = null;

installModifierKeyTracking();

const imageRequests = createImageRequestController({ getEditor: () => currentEditor });

const scrollTargets = createScrollTargets({
    getView: getEditorView,
    getLineMaps: () => ({ lineMap: currentLineMap, lineEndMap: currentLineEndMap }),
    getState: getWebviewState,
});

const toc = initToc(() => getEditorView());
document.body.appendChild(toc.panel);

const findBar = initFindBar(() => document.getElementById("editor"));

let _frontmatterPanelHandle: FrontmatterPanelHandle | null = null;
let _docChangedTimer: ReturnType<typeof setTimeout> | null = null;
let _tocRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let _lastTocSignature = "";

function releaseDocTimers(): void {
    if (_docChangedTimer !== null) {
        clearTimeout(_docChangedTimer);
        _docChangedTimer = null;
    }
    if (_tocRefreshTimer !== null) {
        clearTimeout(_tocRefreshTimer);
        _tocRefreshTimer = null;
    }
    persistence.cancelPendingPush();
}

function renderFrontmatterPanel(frontmatter: string | undefined): void {
    const editorEl = document.getElementById('editor');
    if (!frontmatter) {
        _frontmatterPanelHandle?.dispose();
        _frontmatterPanelHandle = null;
        if (editorEl) { editorEl.style.paddingTop = ''; }
        return;
    }

    _frontmatterPanelHandle?.dispose();
    _frontmatterPanelHandle = createFrontmatterPanel(frontmatter, (serialized) => {
        notifyFrontmatterUpdate(serialized);
    });
    if (!_frontmatterPanelHandle) {
        if (editorEl) { editorEl.style.paddingTop = ''; }
        return;
    }
    const editor = document.getElementById('editor');
    editor?.parentNode?.insertBefore(_frontmatterPanelHandle.panel, editor);
    if (editor) { editor.style.paddingTop = '16px'; }
}

function countWords(text: string): number {
    let count = 0;
    let inNonCjk = false;
    const cjkRe = /[一-鿿㐀-䶿豈-﫿]/;
    for (const ch of text) {
        if (/\s/.test(ch)) {
            inNonCjk = false;
        } else if (cjkRe.test(ch)) {
            inNonCjk = false;
            count++;
        } else {
            if (!inNonCjk) {
                inNonCjk = true;
                count++;
            }
        }
    }
    return count;
}

function updateWordCount(): void {
    const view = getEditorView();
    if (!view) return;
    const text = view.state.doc.textBetween(0, view.state.doc.content.size, "\n");
    notifyWordCount(
        text.split("\n").length,
        countWords(text),
        text.replace(/\s/g, "").length,
        text.length,
    );
}

async function initEditor(
    container: HTMLElement,
    markdown: string,
): Promise<void> {
    if (currentEditor) {
        destroyEditor();
        currentEditor = null;

        closeCodeBlockLightbox();
        closeTableGridPicker();
        closeImagePicker();
        container.innerHTML = "";
        releaseDocTimers();
        _topBarOverflowCtl?.dispose();
        _topBarOverflowCtl = null;
    }

    currentEditor = await createEditor(
        container,
        markdown,
        () => {

            persistence.markUnsavedChanges();
            if (_docChangedTimer) clearTimeout(_docChangedTimer);
            _docChangedTimer = setTimeout(() => {
                notifyMarkDirty();

                updateWordCount();
            }, MARK_DIRTY_DEBOUNCE_MS);

            if (_tocRefreshTimer) clearTimeout(_tocRefreshTimer);
            _tocRefreshTimer = setTimeout(() => {
                requestAnimationFrame(() => {
                    const view = getEditorView();
                    if (!view) return;

                    const sig = computeAllHeadingSignature(view.state.doc);
                    if (sig !== _lastTocSignature) {
                        _lastTocSignature = sig;
                        toc.refresh();
                    }
                });
            }, TOC_REFRESH_DEBOUNCE_MS);
        },
        imageRequests.renameImage,
        () => toc.toggle(),
    );
    toc.show();

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            toc.refresh();
            updateWordCount();
        });
    });

    _topBarOverflowCtl = initTopBarOverflow({
        getTopBarEl: () => document.querySelector<HTMLElement>(".milkdown-top-bar"),
        runItem: (meta) => {
            currentEditor?.action((ctx) => {
                meta.onRun(ctx);
                ctx.get(editorViewCtx).focus();
            });
        },
    });
}

const editorContainer = document.getElementById("editor");
if (editorContainer) {

    initLinkBehavior(editorContainer, { openUrl: notifyOpenUrl, openFile: notifyOpenFile });
    initImagePickerInsertion(imageRequests);
    document.addEventListener('epytor:openSettings', () => notifyOpenSettings());
    setupPathLink(editorContainer);
    initPathComplete(() => getEditorView());
    enhanceCodeBlocks(editorContainer);
    setupTopBarTooltips(editorContainer);
    setupTopBarBrand(editorContainer);

    editorContainer.addEventListener("mousedown", (e) => {
        const img = (e.target as Element).closest<HTMLImageElement>(
            ".image-wrapper img",
        );
        if (!img || !img.src) return;
        if (e.detail === 2 || (e as MouseEvent).ctrlKey || (e as MouseEvent).metaKey) {
            e.preventDefault();
            e.stopPropagation();
            showGlobalLightbox(img.src, img.alt);
        }
    });

    editorContainer.addEventListener("mousedown", (e) => {
        const view = getEditorView();
        if (!view) { return; }
        if (view.dom.contains(e.target as Node)) { return; }
        const lastChild = view.dom.lastElementChild;
        if (!lastChild) { return; }
        const lastRect = lastChild.getBoundingClientRect();
        if (e.clientY <= lastRect.bottom) { return; }
        e.preventDefault();
        const { state } = view;
        const sel = TextSelection.atEnd(state.doc);
        view.dispatch(state.tr.setSelection(sel));
        view.focus();
    });

    initImageDropPaste(editorContainer, imageRequests);
}

window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.code === "KeyF" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        const view = getEditorView();
        let initialQuery: string | undefined;
        if (view) {
            const { selection, doc } = view.state;
            if (!selection.empty) {
                const text = doc.textBetween(selection.from, selection.to);
                if (text.trim()) { initialQuery = text; }
            }
        }
        findBar.open(initialQuery);
    }
});

window.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === "KeyM") {
        e.preventDefault();
        const view = getEditorView();
        const line = view ? switchTargetLine(view, currentLineMap, currentLineEndMap, _lastNavLine) : undefined;
        notifySwitchToTextEditor(line);
    }
});

notifyReady();

const persistence = initSessionPersistence({
    getView: getEditorView,
    getMarkdownForSave,
    getLineMaps: () => ({ lineMap: currentLineMap, lineEndMap: currentLineEndMap }),
    getState: getWebviewState,
    setState: setWebviewState,
    notifyUnsavedContent,
    notifyViewportLine,
});

let _isActivePanel = true;

const restoreEditorFocus = () => {
    if (!_isActivePanel) return;
    requestAnimationFrame(() => {
        if (!_isActivePanel) return;

        if (!document.hasFocus()) return;
        const view = getEditorView();
        if (view && !view.hasFocus()) {
            const active = document.activeElement;
            if (
                active instanceof HTMLInputElement ||
                active instanceof HTMLTextAreaElement
            ) {
                return;
            }

            const scrollBefore = window.scrollY;
            view.focus();

            const restoreScroll = () => {
                if (window.scrollY !== scrollBefore) {
                    window.scrollTo({ top: scrollBefore });
                }
            };
            restoreScroll();
            requestAnimationFrame(restoreScroll);
        }
    });
};
window.addEventListener("focus", restoreEditorFocus);

let _editorLifecycleChain: Promise<unknown> = Promise.resolve();

const compositionGate = createCompositionGate();

onMessage((msg) => {
    const container = document.getElementById("editor");
    if (!container) {
        return;
    }
    if (msg.type === "init" || msg.type === "revert") {
        _editorLifecycleChain = _editorLifecycleChain.then(() =>
            handleEditorLifecycleMessage(msg, container).catch((err) => {
                console.error("[epytor] 编辑器初始化失败:", err);
            }),
        );
        return _editorLifecycleChain;
    }
    return handleRegularMessage(msg);
});

async function handleEditorLifecycleMessage(
    msg: Extract<ToWebviewMessage, { type: "init" | "revert" }>,
    container: HTMLElement,
): Promise<void> {
    const isInit = msg.type === "init";
    currentLineMap = msg.lineMap ?? [];
    currentLineEndMap = msg.lineEndMap ?? [];
    renderFrontmatterPanel(msg.frontmatter);
    if (msg.imageUriMap) { setImageUriMap(msg.imageUriMap); }
    if (isInit) {
        _isActivePanel = msg.active ?? true;

        if (msg.serializationMode) { setSerializationMode(msg.serializationMode); }
    }
    await compositionGate.whenIdle();

    const continuity = captureEditorContinuity();

    const savedSelection = continuity === null && isInit ? persistence.readSavedSelection() : null;
    let restoredSavedSelection = false;

    if (!isInit) { adoptDiskContentAsBaseline(msg.content); }
    await initEditor(container, msg.content);

    scrollTargets.restoreFoldState();
    if (continuity !== null) {
        restoreEditorContinuity(continuity, { isActivePanel: _isActivePanel });
        persistence.saveSelectionNow();
    } else if (
        savedSelection !== null && isInit
        && msg.scrollToLine === undefined && scrollTargets.pending.line === null
    ) {

        restoredSavedSelection = restoreSavedSelection(savedSelection);
    }

    if (isInit) {
        const focusRestoredEditor = restoredSavedSelection;
        requestAnimationFrame(() => {
            if (_isActivePanel) {
                window.focus();

                if (focusRestoredEditor && document.hasFocus()) {
                    getEditorView()?.focus();
                }
            }
        });
    }
    if (isInit && msg.scrollToLine) {
        _lastNavLine = msg.scrollToLine;
        scrollTargets.pending.set(msg.scrollToLine);
    } else if (isInit && scrollTargets.pending.line === null
        && Number((getWebviewState() as { scrollY?: number } | null)?.scrollY ?? 0) > 0) {

        const savedScrollY = Number((getWebviewState() as { scrollY?: number } | null)?.scrollY ?? 0);
        scrollTargets.scheduleDelayedScroll(() => { window.scrollTo({ top: savedScrollY }); });
    } else if (isInit && scrollTargets.pending.line === null) {

        const epochAtStart = getUserInteractionEpoch();
        for (const delay of INITIAL_SCROLL_TOP_DELAYS_MS) {
            setTimeout(() => {
                if (getUserInteractionEpoch() !== epochAtStart) return;
                if (scrollTargets.pending.line !== null) return;
                window.scrollTo({ top: 0 });
            }, delay);
        }
    }
    scrollTargets.applyPendingScrollLine();
    setTimeout(persistence.reportViewportLine, INITIAL_VIEWPORT_LINE_REPORT_DELAY_MS);
}

function handleRegularMessage(msg: ToWebviewMessage): void {
    if (msg.type === "panelActiveState") {
        const wasActive = _isActivePanel;
        _isActivePanel = msg.active;
        if (msg.active && !wasActive) {
            restoreEditorFocus();
        }
    } else if (msg.type === "requestSwitchToTextEditor") {
        const view = getEditorView();
        const line = view ? switchTargetLine(view, currentLineMap, currentLineEndMap, _lastNavLine) : undefined;
        notifySwitchToTextEditor(line);
    } else if (msg.type === "scrollToLine") {

        scrollTargets.pending.set(msg.line);
        scrollTargets.applyPendingScrollLine();
    } else if (msg.type === "lineMapUpdate") {
        currentLineMap = msg.lineMap;
        currentLineEndMap = msg.lineEndMap ?? [];
    } else if (msg.type === "setSerializationMode") {
        setSerializationMode(msg.mode);
    } else if (msg.type === "tableWrapModeChanged") {
        applyTableWrapVars(resolveTableWrapVars(msg.mode));
    } else if (msg.type === "editorMaxWidthChanged") {
        applyEditorMaxWidth(msg.value);
        setTocEditorMaxWidth(msg.value);
    } else if (msg.type === "codeBlockMaxHeightChanged") {
        applyCodeBlockMaxHeight(msg.value);
    } else if (msg.type === "notice") {
        showNotice(msg.message);
    } else if (msg.type === "requestContent") {
        persistence.clearUnsavedChanges();
        notifyContentResponse(getMarkdownForSave());
    } else if (imageRequests.handleMessage(msg)) {
        return;
    } else if (msg.type === "pathSuggestions") {
        resolvePathSuggestionRequest(msg.id, msg.items);
    } else if (msg.type === "imagePathResolved") {
        dispatchImagePathResolved(msg.id, msg.webviewUri);
    } else {

        console.warn("[epytor] 未知消息类型:", (msg as { type: string }).type);
    }
}
