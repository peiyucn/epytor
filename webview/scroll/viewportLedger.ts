
import { clearCollapsedEdge, recordScrollPosition, trackViewportResize } from "./collapseScrollGuard";


export const IFRAME_DEFAULT_WIDTH = 300;
export const IFRAME_DEFAULT_HEIGHT = 150;


export const LAST_BODY_WIDTH_VAR = "--epytor-last-body-width";


export const HOST_COLLAPSED_ATTRIBUTE = "data-epytor-host-collapsed";


export const TINY_REAL_ATTRIBUTE = "data-epytor-tiny-real";


const REAL_INPUT_EVENTS = ["pointerdown", "wheel", "keydown", "touchstart"] as const;


let lastBodyWidth = 0;

export function isCollapsedViewport(width: number, height: number): boolean {
    return width === IFRAME_DEFAULT_WIDTH && height === IFRAME_DEFAULT_HEIGHT;
}


export function isRealTinyViewport(): boolean {
    return document.documentElement.hasAttribute(TINY_REAL_ATTRIBUTE);
}


export function nextTinyReal(
    prev: boolean,
    viewport: { width: number; height: number },
    sawInput: boolean,
): boolean {
    if (!isCollapsedViewport(viewport.width, viewport.height)) { return false; }
    return sawInput ? true : prev;
}


export function isHostCollapsedViewport(): boolean {
    return isCollapsedViewport(window.innerWidth, window.innerHeight) && !isRealTinyViewport();
}


export function shouldSkipViewportWork(): boolean {
    return isCollapsedViewport(window.innerWidth, window.innerHeight);
}


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


function sync(): void {

    syncAttribute(HOST_COLLAPSED_ATTRIBUTE, isHostCollapsedViewport());
    const next = nextLastBodyWidth(lastBodyWidth, readViewport(), readBodyWidth(), isRealTinyViewport());
    if (next === lastBodyWidth) { return; }
    lastBodyWidth = next;
    document.documentElement.style.setProperty(LAST_BODY_WIDTH_VAR, `${next}px`);
}


function onUserInput(): void {
    if (!isCollapsedViewport(window.innerWidth, window.innerHeight) || isRealTinyViewport()) { return; }
    document.documentElement.setAttribute(TINY_REAL_ATTRIBUTE, "");

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


function onScroll(): void {
    recordScrollPosition(isHostCollapsedViewport());
}


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
