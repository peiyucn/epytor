/**
 * Deferred scroll placement: targets (source lines or a saved offset) can arrive before
 * layout is ready, so retry on one shared delay plan and give up after real user interaction
 * (a retry can land 300-2000 ms later on 10k-line documents). Also restores folded headings:
 * saved positions only mean the same document when the heading signature still matches.
 *
 * Extracted from index.ts (audit F1/F10): `PendingScroll` replaces the bare module-level
 * `_pendingScrollLine` written from three places.
 */
import type { EditorView } from "@milkdown/kit/prose/view";
import { getContentBlockElements, scrollToSourceLine } from "./scrollSync";
import { getUserInteractionEpoch } from "../shell/userInteraction";
import { computeAllHeadingSignature } from "../outline/headingFold";
import { headingFoldPluginKey } from "../editor/plugins/headingFoldPlugin";

/** Regression: init and scrollToLine used different retry schedules; share one plan here. */
const SCROLL_RETRY_DELAYS_MS = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];

/** Pending target line: scrollToLine can arrive before render; keep it until the scroll lands. */
export class PendingScroll {
    private _line: number | null = null;

    get line(): number | null {
        return this._line;
    }

    set(line: number): void {
        this._line = line;
    }

    /** Clear only when the scroll for `line` landed; a newer target must survive. */
    clearIf(line: number): void {
        if (this._line === line) { this._line = null; }
    }
}

export interface ScrollTargetsDeps {
    getView(): EditorView | null;
    getLineMaps(): { lineMap: number[]; lineEndMap: number[] };
    getState(): Record<string, unknown> | null;
}

export interface ScrollTargets {
    readonly pending: PendingScroll;
    /** Retry `action` on the delay plan; wait for layout, give up on user interaction. */
    scheduleDelayedScroll(action: (view: EditorView) => void, delays?: number[]): void;
    /** Scroll to the pending line (if any) and clear it once the scroll lands. */
    applyPendingScrollLine(): void;
    /** Restore folds only when the heading signature matches, else saved positions land on other headings. */
    restoreFoldState(): void;
}

export function createScrollTargets(deps: ScrollTargetsDeps): ScrollTargets {
    const pending = new PendingScroll();

    function scheduleDelayedScroll(
        action: (view: EditorView) => void,
        delays: number[] = SCROLL_RETRY_DELAYS_MS,
    ): void {
        const epochAtStart = getUserInteractionEpoch();
        let done = false;
        const tryOnce = () => {
            if (done) return;
            if (getUserInteractionEpoch() !== epochAtStart) { done = true; return; }
            const view = deps.getView();
            if (!view) return;
            // Zero height = layout not done; view.dom.children[0] is the 0-height virtual-cursor widget.
            const firstBlock = getContentBlockElements(view)[0];
            if (!firstBlock || firstBlock.getBoundingClientRect().height === 0) { return; }
            action(view);
            done = true;
        };
        for (const delay of delays) {
            setTimeout(tryOnce, delay);
        }
    }

    function applyPendingScrollLine(): void {
        const line = pending.line;
        if (line === null) { return; }
        scheduleDelayedScroll((view) => {
            const { lineMap, lineEndMap } = deps.getLineMaps();
            scrollToSourceLine(view, lineMap, lineEndMap, line);
            pending.clearIf(line);
        });
    }

    function restoreFoldState(): void {
        const saved = (deps.getState() as
            { foldState?: { sig?: string; folded?: number[] } } | null)?.foldState;
        if (!saved?.sig || !saved.folded?.length) { return; }
        const view = deps.getView();
        if (!view || computeAllHeadingSignature(view.state.doc) !== saved.sig) { return; }
        view.dispatch(
            view.state.tr
                .setMeta(headingFoldPluginKey, { type: "set", folded: saved.folded })
                .setMeta("addToHistory", false),
        );
    }

    return { pending, scheduleDelayedScroll, applyPendingScrollLine, restoreFoldState };
}
