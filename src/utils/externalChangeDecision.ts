/**
 * Decide what to do when the file on disk changes while the editor holds a copy.
 *
 * Comparison is byte-level against `lastSaved` (the serialized text we last wrote),
 * not against raw disk bytes, so serializer normalization (`~` → `\~`) cannot cause
 * false positives.
 *
 * Regression (three rounds, all data/keystroke loss — see docs/tech-debt.md):
 * 1. comparing against the webview's *current* content always yielded "keep user content",
 *    so external writes were never adopted and the stale copy silently overwrote them;
 * 2. keying off the debounced dirty flag instead rebuilt the editor mid-typing;
 * 3. trusting a *fallback* copy of the webview content (inactive panel / timed-out pull) made
 *    it equal to `lastSaved`, so "no unsaved edits" was concluded while the user was typing and
 *    the editor visibly jumped back to the pre-edit state.
 */

export interface ExternalChangeContext {
    latest: string;
    /** Last text we wrote to disk; undefined = snapshot not seeded yet. */
    lastSaved: string | undefined;
    /** What `document.revert()` read back from disk. */
    disk: string;
    /** Debounced webview dirty flag; fallback only when `lastSaved` is unseeded. */
    webviewDirty: boolean;
    /**
     * Whether `latest` really came from the live webview.
     *
     * Fallback content (pushed copy or document memory) can be older than what the user sees,
     * so it cannot be used to conclude "there are no unsaved edits". Defaults to true so callers
     * that always have fresh content keep the old behaviour.
     */
    latestAuthoritative?: boolean;
}

export type ExternalChangeAction = "ignore" | "keepUserContent" | "adoptDisk" | "defer";

export interface ExternalChangeDecision {
    action: ExternalChangeAction;
    /** Set for `defer`: human-readable reason, for the log. */
    reason?: string;
}

export function decideExternalChange(ctx: ExternalChangeContext): ExternalChangeDecision {
    // Identical bytes: our own save, a sync client rewriting them, or an mtime-only touch.
    if (ctx.disk === ctx.latest) {
        return { action: "ignore" };
    }
    // Everything below either replaces what the user sees or writes fallback text into the
    // document model, so a second-hand reading of the editor is not good enough for any of it.
    if (ctx.latestAuthoritative === false) {
        return { action: "defer", reason: "webview content unavailable" };
    }
    const wantsDisk = ctx.lastSaved !== undefined
        ? ctx.latest === ctx.lastSaved
        : !ctx.webviewDirty;
    return { action: wantsDisk ? "adoptDisk" : "keepUserContent" };
}

/**
 * Whether a save request carries nothing new and must not rewrite the file.
 *
 * Trigger: a flush (panel deactivation, autosave) fires on a stale dirty flag while another
 * writer already changed the disk copy. Writing our unchanged buffer would roll the file back
 * to the pre-edit state — the mirror image of the "editor rolled itself back" report.
 */
export function shouldSkipSave(input: {
    /** Content pulled from the webview for this save. */
    content: string;
    /** Text of our own last write; undefined before the first save. */
    lastSaved: string | undefined;
    /** What the document currently holds (refreshed by an adopted external change). */
    diskText: string;
}): boolean {
    if (input.lastSaved === undefined) { return false; }
    // We contribute nothing new …
    if (input.content !== input.lastSaved) { return false; }
    // … and the document already holds different text, i.e. the disk moved on without us.
    return input.diskText !== input.content;
}
