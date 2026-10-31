/**
 * Session persistence for the webview: push the unsaved copy the extension keeps in memory,
 * and persist scroll/caret snapshots in the webview state so a reload can restore them.
 *
 * Owns the three debounce timers and the dirty flag that used to be module-level `let`s in
 * index.ts (audit F1/F10: no single owner, easy to write from several paths). The listeners
 * are registered by `initSessionPersistence` in the entry's original order; nothing is
 * registered at module load, so tests can create fresh instances.
 */
import type { EditorView } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import { visibleSourceLine } from "./scrollSync";
import { parseSavedSelection } from "./editorStatePersistence";
import type { TextSelectionRange } from "./rebuildRestore";

const CONTENT_PUSH_IDLE_MS = 400;
const SCROLL_SAVE_DEBOUNCE_MS = 200;
const SELECTION_SAVE_DEBOUNCE_MS = 300;

/** Everything the persistence layer reads from or reports to the entry. */
export interface PersistenceDeps {
    getView(): EditorView | null;
    getMarkdownForSave(): string;
    getLineMaps(): { lineMap: number[]; lineEndMap: number[] };
    getState(): Record<string, unknown> | null;
    setState(state: Record<string, unknown>): void;
    notifyUnsavedContent(content: string): void;
    notifyViewportLine(line: number): void;
}

export interface SessionPersistence {
    /** Document changed: mark dirty and schedule the trailing-edge push (always paired). */
    markUnsavedChanges(): void;
    /** The host answered a requestContent: persisting is now its job, no flush needed. */
    clearUnsavedChanges(): void;
    /** Drop a scheduled push before an editor rebuild (entry's releaseDocTimers). */
    cancelPendingPush(): void;
    /** Persist the current caret for the next rebuild. */
    saveSelectionNow(): void;
    /** Read the caret persisted by a previous webview instance (null = no usable snapshot). */
    readSavedSelection(): TextSelectionRange | null;
    /** Report the top visible source line (sent after the scroll debounce; used on switch-back). */
    reportViewportLine(): void;
}

export function initSessionPersistence(deps: PersistenceDeps): SessionPersistence {
    let hasUnsavedChanges = false;
    let pushTimer: ReturnType<typeof setTimeout> | null = null;
    let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null;
    let selectionSaveTimer: ReturnType<typeof setTimeout> | null = null;

    function pushContentNow(): void {
        deps.notifyUnsavedContent(deps.getMarkdownForSave());
    }

    /** Trailing-edge push for a webview-independent copy; leading-edge serialization
     *  (~77ms per getMarkdown() at 3k lines) janked typing. Cost: the last 400ms may miss
     *  a save before blur. */
    function scheduleContentPush(): void {
        if (pushTimer !== null) { clearTimeout(pushTimer); }
        pushTimer = setTimeout(() => {
            pushTimer = null;
            pushContentNow();
        }, CONTENT_PUSH_IDLE_MS);
    }

    function flushUnsavedContent(): void {
        if (!hasUnsavedChanges) { return; }
        pushContentNow();
    }

    function reportViewportLine(): void {
        const view = deps.getView();
        if (!view) { return; }
        const { lineMap, lineEndMap } = deps.getLineMaps();
        deps.notifyViewportLine(visibleSourceLine(view, lineMap, lineEndMap));
    }

    // Regression: a full webview reload reset the caret to 1:1; persist the text selection
    // so a rebuild can restore it.
    function saveSelectionNow(): void {
        const view = deps.getView();
        if (!view) { return; }
        const sel = view.state.selection;
        if (!(sel instanceof TextSelection)) { return; }
        const cur = deps.getState() ?? {};
        deps.setState({ ...cur, selection: { from: sel.from, to: sel.to } });
    }

    function readSavedSelection(): TextSelectionRange | null {
        const cur = deps.getState();
        if (!cur) { return null; }
        return parseSavedSelection((cur as { selection?: unknown }).selection);
    }

    // Keep-alive keeps the iframe across tab switches, but closing the tab, reloading the
    // window or switching to source still kills it; blur/pagehide are the last moments to
    // push a copy. Registration order among handlers of one event is preserved.
    window.addEventListener("blur", flushUnsavedContent);
    window.addEventListener("pagehide", flushUnsavedContent);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") { flushUnsavedContent(); }
    });

    window.addEventListener("scroll", () => {
        if (scrollSaveTimer !== null) { clearTimeout(scrollSaveTimer); }
        scrollSaveTimer = setTimeout(() => {
            const cur = deps.getState() ?? {};
            deps.setState({ ...cur, scrollY: window.scrollY });
            reportViewportLine();
        }, SCROLL_SAVE_DEBOUNCE_MS);
    }, { passive: true });

    document.addEventListener("selectionchange", () => {
        if (selectionSaveTimer !== null) { clearTimeout(selectionSaveTimer); }
        selectionSaveTimer = setTimeout(() => {
            selectionSaveTimer = null;
            saveSelectionNow();
        }, SELECTION_SAVE_DEBOUNCE_MS);
    });
    window.addEventListener("blur", saveSelectionNow);
    window.addEventListener("pagehide", saveSelectionNow);

    return {
        markUnsavedChanges: () => {
            hasUnsavedChanges = true;
            scheduleContentPush();
        },
        clearUnsavedChanges: () => {
            hasUnsavedChanges = false;
        },
        cancelPendingPush: () => {
            if (pushTimer !== null) {
                clearTimeout(pushTimer);
                pushTimer = null;
            }
        },
        saveSelectionNow,
        readSavedSelection,
        reportViewportLine,
    };
}
