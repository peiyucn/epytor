
import type { EditorView } from "@milkdown/kit/prose/view";
import { TextSelection } from "@milkdown/kit/prose/state";
import { visibleSourceLine } from "./scrollSync";
import { parseSavedSelection } from "./editorStatePersistence";
import type { TextSelectionRange } from "./rebuildRestore";

const CONTENT_PUSH_IDLE_MS = 400;
const SCROLL_SAVE_DEBOUNCE_MS = 200;
const SELECTION_SAVE_DEBOUNCE_MS = 300;


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

    markUnsavedChanges(): void;

    clearUnsavedChanges(): void;

    cancelPendingPush(): void;

    saveSelectionNow(): void;

    readSavedSelection(): TextSelectionRange | null;

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
