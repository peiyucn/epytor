import './toc.css';
import type { EditorView } from "@milkdown/kit/prose/view";
import { topbarHeight } from "../../ui/topbarMetrics";
import { hideStickyUntilNextInteraction, onActiveHeadingChange, getActiveHeadingPos } from "../../editor/plugins/headingStickyPlugin";
import { applyTooltip } from "@/ui/tooltip";
import { t } from "@/i18n";
import { IconChevronRight, IconChevronDown } from "@/ui/icons";
import { getWebviewState, setWebviewState } from "@/messaging";
import { buildHeadingIndex } from "../../outline/headingFold";
import { headingScrollTop } from "../../outline/headingScroll";
import { pinHeadingHighlight, resolveHighlight, type HeadingHighlightPin } from "../../outline/headingHighlight";
import { getUserInteractionEpoch, USER_INTERACTION_EVENT_TYPES } from "../../shell/userInteraction";
import { shouldSkipViewportWork } from "../../scroll/viewportLedger";

interface HeadingEntry {
    level: number;
    text: string;
    pos: number;
    /** Stable fold key (`level:text#nth`); `pos` drifts on every edit. */
    key: string;
}

/** Regression: `level:text` alone merged same-name headings; pos keys broke on edit drift. */
export function headingFoldKey(level: number, text: string, nth: number): string {
    return `${level}:${text}#${nth}`;
}

/** Assign fold keys by occurrence order (pure; test seam). */
export function assignFoldKeys<T extends { level: number; text: string }>(headings: T[]): (T & { key: string })[] {
    const seen = new Map<string, number>();
    return headings.map((h) => {
        const base = `${h.level}:${h.text}`;
        const nth = (seen.get(base) ?? 0) + 1;
        seen.set(base, nth);
        return { ...h, key: headingFoldKey(h.level, h.text, nth) };
    });
}

const TOC_WIDTH = 200;
const TOC_MIN_WIDTH = 200;
const TOC_MAX_WIDTH = 500;
const DEFAULT_EDITOR_MAX_WIDTH = 900;
const TAB_DRAG_THRESHOLD_PX = 3;
const ITEM_INDENT_STEP_PX = 12;
const ITEM_INDENT_BASE_PX = 8;

/**
 * Auto-show needs the editor column plus this margin (default 900 + 100px).
 *
 * Measured against the viewport, never against the free space beside the column: opening the
 * panel shrinks that space and would immediately close it again (feedback loop).
 */
export const TOC_AUTO_SHOW_EXTRA_PX = 100;

/** Pure predicate: is the viewport wide enough to auto-open? */
export function shouldAutoShowToc(viewportWidth: number, editorMaxWidth: number): boolean {
    return viewportWidth >= editorMaxWidth + TOC_AUTO_SHOW_EXTRA_PX;
}

/** Dismissed wins over width; a manual open clears that preference but keeps the width rule. */
export function resolveTocOpen(dismissed: boolean, viewportWidth: number, editorMaxWidth: number): boolean {
    if (dismissed) { return false; }
    return shouldAutoShowToc(viewportWidth, editorMaxWidth);
}

/** Every heading level, indexed like folding/sticky does (TOC lists all levels). */
function getHeadings(view: EditorView): HeadingEntry[] {
    return assignFoldKeys(
        buildHeadingIndex(view.state.doc).map((entry) => ({
            level: entry.level,
            text: entry.text,
            pos: entry.pos,
        })),
    );
}

/** `nodeDOM` is exact; fall back to `domAtPos` + ancestor walk when the node owns no DOM. */
function findHeadingElement(view: EditorView, pos: number): HTMLElement | null {
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (dom?.matches("h1,h2,h3,h4,h5,h6")) return dom;
    const { node } = view.domAtPos(pos + 1);
    let el: HTMLElement | null =
        node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as HTMLElement);
    while (el && !el.matches("h1,h2,h3,h4,h5,h6")) el = el.parentElement;
    return el;
}

function hasChildren(headings: HeadingEntry[], index: number): boolean {
    if (index >= headings.length - 1) return false;
    return headings[index + 1].level > headings[index].level;
}

function isHeadingVisible(headings: HeadingEntry[], index: number, collapsed: Set<string>): boolean {
    let ancestorLevel = headings[index].level;
    for (let i = index - 1; i >= 0; i--) {
        if (headings[i].level < ancestorLevel) {
            if (collapsed.has(headings[i].key)) return false;
            ancestorLevel = headings[i].level;
        }
    }
    return true;
}

/** Editor page width in px, written by initToc's owner on config changes. */
let _editorMaxWidth = DEFAULT_EDITOR_MAX_WIDTH;

export function setTocEditorMaxWidth(width: number): void {
    if (Number.isFinite(width) && width > 0) { _editorMaxWidth = width; }
}

export function initToc(getEditorView: () => EditorView | null): {
    panel: HTMLElement;
    toggle: () => void;
    refresh: () => void;
    show: () => void;
    /** Detach this instance's listeners (idempotent). */
    dispose: () => void;
} {
    const panel = document.createElement("div");
    panel.className = "toc-panel";

    /** List item → heading DOM element (filled on refresh; used by click-to-jump). */
    const headingEls = new WeakMap<HTMLElement, HTMLElement>();

    /** Heading pos → list item (active highlight follows these). */
    const itemByPos = new Map<number, HTMLElement>();

    /**
     * List item → its *current* heading pos, rebound together with `itemByPos`; clicking reads
     * it in O(1). Not `posAtDOM`: that is "node start + 1" and has caused two off-by-one bugs.
     */
    const posByItem = new Map<HTMLElement, number>();

    /**
     * Rendered signature (visible identity + fold state, no positions) and its DOM items.
     * Typing only shifts positions, so an unchanged signature means no rebuild — the regression
     * was `innerHTML = ""` on every typing pause, which made the list flicker.
     * Initial `null`, not `""`: an empty document also has an empty signature and must still
     * render the "No headings" placeholder.
     */
    let renderedSignature: string | null = null;
    let renderedItems: HTMLElement[] = [];

    /**
     * Highlight the active section and scroll it into view.
     * Only the list's own scrollTop moves; `scrollIntoView` would also scroll the page.
     */
    function applyActiveHeading(pos: number | null): void {
        // Positions drift on input while the sticky plugin publishes the *new* pos; rebind
        // instead of clearing the highlight. Not a hot path: it only publishes real changes.
        if (pos !== null && !itemByPos.has(pos)) { rebindFromDocument(); }

        // The click pin outranks geometry (short documents cannot express "which item was
        // clicked"); any further user interaction releases it. See outline/headingHighlight.ts.
        const resolved = resolveHighlight(pinnedHighlight, pos, getUserInteractionEpoch());
        pinnedHighlight = resolved.pin;
        const effective = resolved.pos;

        for (const [itemPos, el] of itemByPos) {
            el.classList.toggle("toc-item--active", effective !== null && itemPos === effective);
        }
        if (effective === null) { return; }
        const item = itemByPos.get(effective);
        if (!item) { return; }
        const listRect = list.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        if (itemRect.top >= listRect.top && itemRect.bottom <= listRect.bottom) { return; }
        list.scrollTop += itemRect.top - listRect.top - (listRect.height - itemRect.height) / 2;
    }

    /** Click pin (null = follow scrolling); released by `resolveHighlight` on interaction. */
    let pinnedHighlight: HeadingHighlightPin | null = null;

    /**
     * Release the pin when the user interacts again. The lazy release inside
     * `applyActiveHeading` is not enough: the plugin only publishes a *change*, which never
     * happens in short documents. Bubble phase: a click on an item bumps the epoch first, so
     * the pin created with the new epoch still matches and does not release itself.
     */
    function releasePinOnInteraction(): void {
        if (pinnedHighlight === null) { return; }
        if (getUserInteractionEpoch() === pinnedHighlight.epoch) { return; }
        pinnedHighlight = null;
        applyActiveHeading(getActiveHeadingPos());
    }

    /** Recompute item ↔ pos bindings from the current document (DOM untouched; drift fallback). */
    function rebindFromDocument(): void {
        const view = getEditorView();
        if (!view) return;
        const headings = getHeadings(view);
        const visible = visibleHeadingIndices(headings);
        // Structure differs ⇒ refresh has not landed yet; rebinding now would mismatch.
        if (renderSignature(headings, visible) !== renderedSignature) { return; }
        bindPositions(view, headings, visible);
    }

    const header = document.createElement("div");
    header.className = "toc-header";

    const headerTitle = document.createElement("span");
    headerTitle.className = "toc-header-title";
    // Short label: the panel is narrow, so "Contents" (localized) fits.
    headerTitle.textContent = t("Contents");
    header.appendChild(headerTitle);

    const list = document.createElement("div");
    list.className = "toc-list";

    panel.appendChild(header);
    panel.appendChild(list);

    // Fixed tab outside the panel; JS keeps it on the panel's right edge.
    const tabEl = document.createElement("button");
    tabEl.className = "toc-toggle-tab";
    tabEl.tabIndex = -1;
    document.body.appendChild(tabEl);

    /**
     * Two states only. `dismissedByUser` is the persisted "user closed it" preference and
     * outranks width; opening clears it. See docs/specs/2026-09-12-toc-two-state.md.
     */
    let isOpen = false;
    let dismissedByUser = false;
    let panelWidth = TOC_WIDTH;

    // Restore close preference and width (`tocPinned` is retired and no longer read).
    const savedState = getWebviewState();
    if (savedState?.tocDismissed === true) { dismissedByUser = true; }
    if (savedState?.tocWidth && typeof savedState.tocWidth === "number") {
        panelWidth = Math.min(TOC_MAX_WIDTH, Math.max(TOC_MIN_WIDTH, savedState.tocWidth));
    }
    panel.style.width = `${panelWidth}px`;

    // Fold keys are stable identities (level:text#nth). Pos keys misfolded across documents
    // and drifted on edit; level:text alone made duplicate headings share one toggle.
    const collapsedHeadings = new Set<string>();
    if (Array.isArray(savedState?.tocCollapsed)) {
        for (const key of savedState.tocCollapsed) {
            // Accept current string keys only; legacy numeric/level:text keys are dropped once
            // (they can never match again and would be re-persisted forever).
            if (typeof key === "string" && key.includes("#")) collapsedHeadings.add(key);
        }
    }

    function saveCollapsedState(): void {
        setWebviewState({
            ...(getWebviewState() ?? {}),
            tocDismissed: dismissedByUser,
            tocWidth: panelWidth,
            tocCollapsed: Array.from(collapsedHeadings),
        });
    }

    /** Fold marker; part of the render signature so arrow flips trigger a rebuild. */
    function foldStateOf(headings: HeadingEntry[], idx: number): string {
        if (!hasChildren(headings, idx)) { return "-"; }
        return collapsedHeadings.has(headings[idx].key) ? "closed" : "open";
    }

    /** Visible identity + fold state, deliberately position-free. */
    function renderSignature(headings: HeadingEntry[], visible: number[]): string {
        return visible.map((idx) => `${headings[idx].key}|${foldStateOf(headings, idx)}`).join("\n");
    }

    /** Indexes of headings currently visible under the collapsed set. */
    function visibleHeadingIndices(headings: HeadingEntry[]): number[] {
        const visible: number[] = [];
        for (let idx = 0; idx < headings.length; idx++) {
            if (isHeadingVisible(headings, idx, collapsedHeadings)) { visible.push(idx); }
        }
        return visible;
    }

    /** Build one item; only called on structural changes. */
    function createItem(headings: HeadingEntry[], idx: number): HTMLElement {
        const h = headings[idx];
        const item = document.createElement("div");
        item.className = `toc-item toc-item--h${h.level}`;
        item.style.paddingLeft = `${(h.level - 1) * ITEM_INDENT_STEP_PX + ITEM_INDENT_BASE_PX}px`;

        const hasKids = hasChildren(headings, idx);
        const isCollapsed = collapsedHeadings.has(h.key);
        const toggle = document.createElement("span");
        toggle.className = "toc-collapse-toggle";
        if (hasKids) {
            toggle.innerHTML = isCollapsed ? IconChevronRight : IconChevronDown;
            toggle.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isCollapsed) {
                    collapsedHeadings.delete(h.key);
                } else {
                    collapsedHeadings.add(h.key);
                }
                saveCollapsedState();
                refresh();
            });
        } else {
            // Leaf placeholder dash: the row itself jumps, so no "disabled" cursor.
            toggle.textContent = "–";
        }
        item.appendChild(toggle);

        const label = document.createElement("span");
        label.className = "toc-item-label";
        label.textContent = h.text || `${t("Heading")} ${h.level}`;
        applyTooltip(label, h.text, { placement: "above", truncatedOnly: true });

        item.appendChild(label);

        // Bind the jump to the whole row: the label is only the text box, so clicks on the
        // padding were dead even though hover highlighted the full row. The arrow stops
        // propagation itself, so it never doubles up here.
        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const v = getEditorView();
            if (!v) return;
            try {
                // Pos comes from the element recorded at refresh time: O(1), and correct for
                // duplicate titles (the former level+text lookup always hit the first one).
                const el = headingEls.get(item);
                if (!el || !v.dom.contains(el)) return;
                const targetPos = posByItem.get(item);
                if (targetPos === undefined) return;
                const topbarH = topbarHeight();
                // Hide the sticky bar until the next interaction so the target shows normally.
                hideStickyUntilNextInteraction();
                // Land below the reading line, otherwise the highlight stays on the previous item.
                const top = headingScrollTop(
                    el.getBoundingClientRect().top + window.scrollY,
                    topbarH,
                );
                // Pin the clicked item: short documents cannot scroll, so geometry alone always
                // reports the last item. Epoch read after the click, else it releases itself.
                pinnedHighlight = pinHeadingHighlight(targetPos, getUserInteractionEpoch());
                applyActiveHeading(targetPos);
                window.scrollTo({ top, behavior: "smooth" });
            } catch { /* heading element already detached; skip this jump */ }
        });

        return item;
    }

    /**
     * Rebind item ↔ pos from the current document without touching the DOM.
     * Positions are always re-read: typing shifts every heading, stale bindings point at the
     * wrong section.
     */
    function bindPositions(view: EditorView, headings: HeadingEntry[], visible: number[]): void {
        itemByPos.clear();
        posByItem.clear();
        visible.forEach((idx, slot) => {
            const item = renderedItems[slot];
            if (!item) return;
            itemByPos.set(headings[idx].pos, item);
            posByItem.set(item, headings[idx].pos);
            const headingEl = findHeadingElement(view, headings[idx].pos);
            if (headingEl) { headingEls.set(item, headingEl); }
        });
    }

    function refresh(): void {
        if (!isOpen) return;
        const view = getEditorView();
        if (!view) return;
        const headings = getHeadings(view);
        const visible = visibleHeadingIndices(headings);
        const signature = renderSignature(headings, visible);

        // Same structure (typing): leave the DOM alone and only rebind positions, so list
        // scroll, hover and tooltips are not interrupted.
        if (signature === renderedSignature) {
            bindPositions(view, headings, visible);
            applyActiveHeading(getActiveHeadingPos());
            return;
        }

        // Structure changed (rename / add / remove / level / fold): rebuild the list.
        renderedSignature = signature;
        list.innerHTML = "";
        renderedItems = [];
        // headingEls is a WeakMap: dropped items become collectable without clearing.
        if (visible.length === 0) {
            const empty = document.createElement("div");
            empty.className = "toc-empty";
            empty.textContent = t("No headings");
            list.appendChild(empty);
            itemByPos.clear();
            return;
        }
        for (const idx of visible) {
            const item = createItem(headings, idx);
            list.appendChild(item);
            renderedItems.push(item);
        }
        bindPositions(view, headings, visible);
        applyActiveHeading(getActiveHeadingPos());
    }

    function syncBodyPadding(): void {
        document.body.classList.toggle("toc-open", isOpen);
        const topbar = document.querySelector<HTMLElement>(".milkdown-top-bar");
        // The panel always pushes the body (no overlay mode); narrow windows are the user's call.
        if (isOpen) {
            document.body.style.paddingLeft = `${panelWidth}px`;
            if (topbar) topbar.style.paddingLeft = `${panelWidth}px`;
        } else {
            document.body.style.paddingLeft = '';
            if (topbar) topbar.style.paddingLeft = '';
        }
    }

    /**
     * Keep the tab on the panel's right edge. `transform`, not `left`: the panel opens with a
     * compositor-only transform, so a layout-property tab visibly lags behind it.
     */
    function updateTabPos(): void {
        tabEl.style.transform = isOpen ? `translateX(${panelWidth}px)` : 'translateX(0px)';
        tabEl.textContent = isOpen ? "‹" : "›";
        tabEl.dataset.tocState = isOpen ? "open" : "closed";
        applyTooltip(tabEl, isOpen ? t("Collapse") : t("Expand"), { placement: "above" });
    }

    /** Close; `byUser` records the "user closed it" preference (persisted, outranks width). */
    function close(byUser: boolean): void {
        isOpen = false;
        panel.classList.remove("toc-panel--open");
        if (byUser) {
            dismissedByUser = true;
            saveCollapsedState();
        }
        updateTabPos();
        syncBodyPadding();
    }

    /** Open; a user open clears the close preference (width then decides whether it stays). */
    function open(byUser: boolean): void {
        isOpen = true;
        if (byUser && dismissedByUser) {
            dismissedByUser = false;
            saveCollapsedState();
        }
        panel.classList.add("toc-panel--open");
        refresh();
        updateTabPos();
        syncBodyPadding();
    }

    function toggle(): void {
        if (isOpen) {
            close(true);
        } else {
            open(true);
        }
    }

    // Closed: click toggles. Open: click toggles, drag resizes.
    let tabDragStart = 0;
    let tabDragWidth = 0;
    let tabDragging = false;
    tabEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isOpen) { toggle(); return; }
        tabDragStart = e.clientX;
        tabDragWidth = panelWidth;
        tabDragging = false;
        document.body.classList.add("toc-resizing");

        function onMove(ev: MouseEvent) {
            const delta = ev.clientX - tabDragStart;
            if (!tabDragging && Math.abs(delta) < TAB_DRAG_THRESHOLD_PX) return;
            tabDragging = true;
            const newWidth = Math.min(TOC_MAX_WIDTH, Math.max(TOC_MIN_WIDTH, tabDragWidth + delta));
            if (newWidth !== panelWidth) {
                panelWidth = newWidth;
                panel.style.width = `${panelWidth}px`;
                updateTabPos();
                syncBodyPadding();
            }
        }
        function onUp() {
            document.body.classList.remove("toc-resizing");
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            if (!tabDragging) toggle();
            saveCollapsedState();
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    function checkAutoShow(): void {
        // Collapsed host viewport is a fake 300×150; measuring there flashes the panel on return.
        if (shouldSkipViewportWork()) return;
        const shouldOpen = resolveTocOpen(dismissedByUser, document.documentElement.clientWidth, _editorMaxWidth);
        if (shouldOpen && !isOpen) {
            open(false);
        } else if (!shouldOpen && isOpen) {
            close(false);
        } else if (isOpen) {
            syncBodyPadding();
        }
    }

    // Panel geometry (top/height) is declared statically in toc.css, aligned with the top bar.

    updateTabPos();
    requestAnimationFrame(() => {
        checkAutoShow();
        // First frame: sync the current section (the subscription only covers changes).
        applyActiveHeading(getActiveHeadingPos());
    });

    window.addEventListener("resize", checkAutoShow);
    // Follow the active heading (same source as the sticky bar's innermost line).
    const unsubscribeActiveHeading = onActiveHeadingChange(applyActiveHeading);

    // Release the click pin on the next interaction; the event set is the single source of
    // truth in userInteraction (regression F4).
    window.addEventListener("scroll", releasePinOnInteraction, { passive: true });
    for (const type of USER_INTERACTION_EVENT_TYPES) {
        window.addEventListener(type, releasePinOnInteraction, { passive: true });
    }

    function show(): void {
        panel.style.visibility = 'visible';
        tabEl.style.visibility = 'visible';
    }

    /**
     * Detach every listener this instance registered.
     *
     * The webview normally lives as long as the page, so this is not a leak fix — it exists so a
     * second instance (tests, or a future per-document remount) starts clean instead of stacking
     * listeners on top of the previous one (regression: tocRefresh had to work around it).
     */
    let disposed = false;
    function dispose(): void {
        if (disposed) { return; }
        disposed = true;
        window.removeEventListener("resize", checkAutoShow);
        window.removeEventListener("scroll", releasePinOnInteraction);
        for (const type of USER_INTERACTION_EVENT_TYPES) {
            window.removeEventListener(type, releasePinOnInteraction);
        }
        unsubscribeActiveHeading();
        panel.remove();
        tabEl.remove();
    }

    return { panel, toggle, refresh, show, dispose };
}
