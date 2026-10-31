/**
 * Scroll restoration guard for collapse/restore (pure state, driven by viewportLedger).
 *
 * While collapsed the 300x150 viewport reflows the text and scroll anchoring shifts the
 * position in place (measured 1500 -> 1773); restoring the real size can shift it again.
 * No user scroll is possible while collapsed, so the expected position is the last one
 * recorded at a real size. This module does not decide whether the viewport is collapsed;
 * the caller passes that in, avoiding both a dependency and an import cycle.
 * Two rAF passes because anchoring can land after resize returns; scroll recording is
 * muted meanwhile, otherwise the restored position would overwrite it.
 */

/** Second pass: anchoring may settle after resize has returned. */
const RESTORE_FRAMES = 2;

let lastRealScrollY = 0;
/** A webview created collapsed must not restore 0. */
let hasRealScrollRecord = false;
/** Collapse state of the previous reading, used to detect the enter/restore edges. */
let wasCollapsed = false;
/** Restoration in progress: scroll events must not overwrite the locked expected value. */
let restoringScroll = false;

/** Record the current position; skipped while collapsed (fake reading) or restoring. */
export function recordScrollPosition(collapsed: boolean): void {
    if (restoringScroll || collapsed) { return; }
    lastRealScrollY = window.scrollY;
    hasRealScrollRecord = true;
}

function restoreTo(expected: number): void {
    restoringScroll = true;
    const restore = (): void => {
        if (window.scrollY !== expected) { window.scrollTo(0, expected); }
    };
    const tick = (remaining: number): void => {
        restore();
        if (remaining > 1) { requestAnimationFrame(() => tick(remaining - 1)); }
        else { restoringScroll = false; }
    };
    requestAnimationFrame(() => tick(RESTORE_FRAMES));
}

/** Entering a collapse does nothing; restoring puts the recorded position back; a resize just updates it. */
export function trackViewportResize(collapsed: boolean): void {
    if (wasCollapsed && !collapsed && hasRealScrollRecord) {
        restoreTo(lastRealScrollY);
    } else if (!collapsed) {
        lastRealScrollY = window.scrollY;
        hasRealScrollRecord = true;
    }
    wasCollapsed = collapsed;
}

/** Reset the edge for a real tiny window: leaving it is not a collapse restore. */
export function clearCollapsedEdge(): void {
    wasCollapsed = false;
}
