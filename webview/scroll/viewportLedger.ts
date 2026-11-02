/**
 * Page-lifecycle singleton: installs window/document listeners once per webview load.
 * No teardown by design — the page and these listeners share one lifetime; disposing them on
 * editor rebuild would drop observers the next document still needs.
 */
import { clearCollapsedEdge, recordScrollPosition, trackViewportResize } from "./collapseScrollGuard";

/** Chromium's iframe default: the shared reading of a detached host and a real tiny window. */
export const IFRAME_DEFAULT_WIDTH = 300;
export const IFRAME_DEFAULT_HEIGHT = 150;

/** CSS variable holding the last real body width (consumed by the collapse guard). */
export const LAST_BODY_WIDTH_VAR = "--epytor-last-body-width";

/**
 * "Host is collapsed" attribute on `<html>`; single source of truth for the CSS guard.
 * Not `@media (width: 300px) and (height: 150px)`: Chromium evaluates media queries at
 * the zoomed size while `window.innerWidth` is unzoomed CSS px, so the media guard failed
 * on zoomed setups (regression: 300px reflow and collapsed toolbar still visible).
 */
export const HOST_COLLAPSED_ATTRIBUTE = "data-epytor-host-collapsed";

/** "Real tiny window" attribute on `<html>`; lets CSS tell the two sources of a reading apart. */
export const TINY_REAL_ATTRIBUTE = "data-epytor-tiny-real";

/** Input that proves the host did not detach (a detached webview receives none). */
const REAL_INPUT_EVENTS = ["pointerdown", "wheel", "keydown", "touchstart"] as const;

/** Last recorded real body width (px; 0 = no baseline yet). */
let lastBodyWidth = 0;

export function isCollapsedViewport(width: number, height: number): boolean {
    return width === IFRAME_DEFAULT_WIDTH && height === IFRAME_DEFAULT_HEIGHT;
}

/** Whether the user really operated at this size (DOM attribute only: CSS and JS share one source). */
export function isRealTinyViewport(): boolean {
    return document.documentElement.hasAttribute(TINY_REAL_ATTRIBUTE);
}

/** Input at the collapsed reading means a real window; no input keeps the verdict; any other size clears it. */
export function nextTinyReal(
    prev: boolean,
    viewport: { width: number; height: number },
    sawInput: boolean,
): boolean {
    if (!isCollapsedViewport(viewport.width, viewport.height)) { return false; }
    return sawInput ? true : prev;
}

/**
 * Whether the collapsed reading definitely comes from a host detach. A real 300x150
 * window returns false so it is measured for real; otherwise the top bar keeps the
 * previous width and overflows (regression A6).
 */
export function isHostCollapsedViewport(): boolean {
    return isCollapsedViewport(window.innerWidth, window.innerHeight) && !isRealTinyViewport();
}

/**
 * Whether viewport-driven measurement should be skipped (TOC auto show/hide, sticky
 * geometry, top bar measurement). Measuring at the fake 300x150 collapses buttons into
 * "...", hides the TOC and misplaces the sticky bar; all of it is off screen and shows as
 * a flash on restore. Deliberately ignores the real-tiny-window mark (the top bar pin and
 * the ledger use `isHostCollapsedViewport` instead).
 */
export function shouldSkipViewportWork(): boolean {
    return isCollapsedViewport(window.innerWidth, window.innerHeight);
}

/** Next real geometry: fake collapsed readings and non-positive widths are not recorded. */
export function nextLastBodyWidth(
    prev: number,
    viewport: { width: number; height: number },
    bodyWidth: number,
    tinyReal = false,
): number {
    if ((isCollapsedViewport(viewport.width, viewport.height) && !tinyReal) || bodyWidth <= 0) {
        return prev;
    }
    return bodyWidth;
}

function readViewport(): { width: number; height: number } {
    return { width: window.innerWidth, height: window.innerHeight };
}

function readBodyWidth(): number {
    return document.body?.getBoundingClientRect().width ?? 0;
}

function syncAttribute(attribute: string, on: boolean): void {
    const root = document.documentElement;
    if (on === root.hasAttribute(attribute)) { return; }
    if (on) { root.setAttribute(attribute, ""); }
    else { root.removeAttribute(attribute); }
}

/** Record one reading and sync the CSS variable and collapse attribute (no DOM write when unchanged). */
function sync(): void {
    // The ResizeObserver fires on every content resize (typing included), so keep it cheap.
    syncAttribute(HOST_COLLAPSED_ATTRIBUTE, isHostCollapsedViewport());
    const next = nextLastBodyWidth(lastBodyWidth, readViewport(), readBodyWidth(), isRealTinyViewport());
    if (next === lastBodyWidth) { return; }
    lastBodyWidth = next;
    document.documentElement.style.setProperty(LAST_BODY_WIDTH_VAR, `${next}px`);
}

/** User input at the collapsed reading: it is a real tiny window, so drop the guard and record it. */
function onUserInput(): void {
    if (!isCollapsedViewport(window.innerWidth, window.innerHeight) || isRealTinyViewport()) { return; }
    document.documentElement.setAttribute(TINY_REAL_ATTRIBUTE, "");
    // Leaving this real 300x150 must not trigger a "collapse restore" scroll correction.
    clearCollapsedEdge();
    sync();
}

function onViewportResize(): void {
    const marked = isRealTinyViewport();
    const next = nextTinyReal(marked, readViewport(), false);
    if (next !== marked) { syncAttribute(TINY_REAL_ATTRIBUTE, next); }

    trackViewportResize(isHostCollapsedViewport());
    sync();
}

/** Scroll at a real reading: remember the position (the scroll guard ignores fake readings). */
function onScroll(): void {
    recordScrollPosition(isHostCollapsedViewport());
}

/**
 * Initialize once from the webview entry: take a baseline, then track body width (window
 * zoom, scrollbar changes) and install the real-tiny-window input test. A collapsed init
 * (page created in the background) writes nothing; CSS falls back to 100% and the first
 * callback after restoring fills the variable in.
 */
export function initViewportLedger(): void {
    lastBodyWidth = 0;
    sync();
    for (const type of REAL_INPUT_EVENTS) {
        window.addEventListener(type, onUserInput, { passive: true });
    }
    window.addEventListener("resize", onViewportResize);
    window.addEventListener("scroll", onScroll, { passive: true });
    if (typeof ResizeObserver === "undefined" || !document.body) { return; }
    new ResizeObserver(sync).observe(document.body);
}
