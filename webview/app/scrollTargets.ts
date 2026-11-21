
import type { EditorView } from "@milkdown/kit/prose/view";
import { getContentBlockElements, scrollToSourceLine } from "./scrollSync";
import { getUserInteractionEpoch } from "../shell/userInteraction";
import { computeAllHeadingSignature } from "../outline/headingFold";
import { headingFoldPluginKey } from "../editor/plugins/headingFoldPlugin";

const SCROLL_RETRY_DELAYS_MS = [0, 250, 500, 750, 1000, 1250, 1500, 1750, 2000];

export class PendingScroll {
    private _line: number | null = null;

    get line(): number | null {
        return this._line;
    }

    set(line: number): void {
        this._line = line;
    }

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

    scheduleDelayedScroll(action: (view: EditorView) => void, delays?: number[]): void;

    applyPendingScrollLine(): void;

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
