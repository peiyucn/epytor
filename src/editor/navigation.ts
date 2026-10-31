/**
 * Navigation state of the WYSIWYG editor (pure state, no panels or webviews).
 *
 * The provider used to keep these maps and scalars inline next to its panel bookkeeping,
 * which made "one document's scroll position" impossible to reason about or test on its own.
 * Panels and message delivery stay in the provider; deciding *which* line a view should
 * restore belongs here.
 */
import * as vscode from "vscode";

/** A global reveal request older than this is stale (tab may have changed since). */
const GLOBAL_REVEAL_LINE_TTL_MS = 10_000;
/** A pending per-document navigation expires so a later activation cannot jump unexpectedly. */
const PENDING_NAVIGATION_TTL_MS = 5000;

interface PendingLine {
    line: number;
    ts: number;
}

/** Scroll a 1-indexed line to the top of the viewport. */
export function revealLineAtTop(editor: vscode.TextEditor, line: number): void {
    const target = Math.max(0, Math.min(line - 1, editor.document.lineCount - 1));
    const pos = new vscode.Position(target, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);
}

export class NavigationState {
    // Pending scroll targets, keyed by uriKey (the same key as every other per-document state).
    private readonly _pendingNavigations = new Map<string, PendingLine>();

    /** Fallback target when a global `revealLine` fires before the active tab switches. */
    private _pendingRevealLine: PendingLine | undefined;

    /**
     * Line (1-indexed) to restore after "switch to source", applied on
     * `onDidChangeActiveTextEditor` because a reveal right after the reopen command is dropped
     * before the first layout.
     */
    private _pendingEditorReveal: { uriKey: string; line: number } | undefined;

    /**
     * Last seen line on each side, so every switch path (our commands, "Reopen With", the tab
     * context menu) restores position, not only the ones we drive.
     */
    private readonly _lastPreviewLines = new Map<string, number>();
    private readonly _lastTextLines = new Map<string, number>();

    /** Called from extension.ts; consumed by the next panel activation. */
    setGlobalRevealLine(line: number): void {
        this._pendingRevealLine = { line, ts: Date.now() };
    }

    consumeGlobalRevealLine(): number | undefined {
        const pending = this._pendingRevealLine;
        if (!pending) { return undefined; }
        this._pendingRevealLine = undefined;
        if (Date.now() - pending.ts > GLOBAL_REVEAL_LINE_TTL_MS) { return undefined; }
        return pending.line;
    }

    /**
     * Stash a pending scroll target; the caller delivers it immediately when the panel is
     * visible. `directOnly` keeps a delivered target out of the queue so it cannot pollute a
     * later activation, while an undelivered one is still stashed.
     */
    rememberPendingNavigation(uriKey: string, line: number): void {
        this._pendingNavigations.set(uriKey, { line, ts: Date.now() });
    }

    consumePendingNavigation(uriKey: string): number | undefined {
        const pending = this._pendingNavigations.get(uriKey);
        if (!pending) { return undefined; }
        this._pendingNavigations.delete(uriKey);
        if (Date.now() - pending.ts > PENDING_NAVIGATION_TTL_MS) { return undefined; }
        return pending.line;
    }

    recordPreviewLine(uriKey: string, line: number): void {
        this._lastPreviewLines.set(uriKey, line);
    }

    getPreviewLine(uriKey: string): number | undefined {
        return this._lastPreviewLines.get(uriKey);
    }

    recordTextLine(uriKey: string, line: number): void {
        this._lastTextLines.set(uriKey, line);
    }

    /** Read-and-clear: later activations must not snap back to the same text-editor line. */
    consumeLastTextLine(uriKey: string): number | undefined {
        const line = this._lastTextLines.get(uriKey);
        this._lastTextLines.delete(uriKey);
        return line;
    }

    stashEditorReveal(uriKey: string, line: number): void {
        this._pendingEditorReveal = { uriKey, line };
    }

    hasPendingEditorReveal(): boolean {
        return this._pendingEditorReveal !== undefined;
    }

    /**
     * Return the stashed line and clear it, but only when it belongs to `uriKey`: the listener
     * may fire for another document first and the reveal must survive until its own editor shows.
     */
    takeEditorReveal(uriKey: string): number | undefined {
        const pending = this._pendingEditorReveal;
        if (!pending || pending.uriKey !== uriKey) { return undefined; }
        this._pendingEditorReveal = undefined;
        return pending.line;
    }

    /** Clear the per-document entries; called when the WYSIWYG panel is disposed. */
    dispose(uriKey: string): void {
        this._pendingNavigations.delete(uriKey);
        this._lastPreviewLines.delete(uriKey);
        this._lastTextLines.delete(uriKey);
        if (this._pendingEditorReveal?.uriKey === uriKey) {
            this._pendingEditorReveal = undefined;
        }
    }
}
