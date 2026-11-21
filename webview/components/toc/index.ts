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

    key: string;
}

export function headingFoldKey(level: number, text: string, nth: number): string {
    return `${level}:${text}#${nth}`;
}

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

export const TOC_AUTO_SHOW_EXTRA_PX = 100;

export function shouldAutoShowToc(viewportWidth: number, editorMaxWidth: number): boolean {
    return viewportWidth >= editorMaxWidth + TOC_AUTO_SHOW_EXTRA_PX;
}

export function resolveTocOpen(dismissed: boolean, viewportWidth: number, editorMaxWidth: number): boolean {
    if (dismissed) { return false; }
    return shouldAutoShowToc(viewportWidth, editorMaxWidth);
}

function getHeadings(view: EditorView): HeadingEntry[] {
    return assignFoldKeys(
        buildHeadingIndex(view.state.doc).map((entry) => ({
            level: entry.level,
            text: entry.text,
            pos: entry.pos,
        })),
    );
}

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

let _editorMaxWidth = DEFAULT_EDITOR_MAX_WIDTH;

export function setTocEditorMaxWidth(width: number): void {
    if (Number.isFinite(width) && width > 0) { _editorMaxWidth = width; }
}

export function initToc(getEditorView: () => EditorView | null): {
    panel: HTMLElement;
    toggle: () => void;
    refresh: () => void;
    show: () => void;

    dispose: () => void;
} {
    const panel = document.createElement("div");
    panel.className = "toc-panel";

    const headingEls = new WeakMap<HTMLElement, HTMLElement>();

    const itemByPos = new Map<number, HTMLElement>();

    const posByItem = new Map<HTMLElement, number>();

    let renderedSignature: string | null = null;
    let renderedItems: HTMLElement[] = [];

    function applyActiveHeading(pos: number | null): void {

        if (pos !== null && !itemByPos.has(pos)) { rebindFromDocument(); }

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

    let pinnedHighlight: HeadingHighlightPin | null = null;

    function releasePinOnInteraction(): void {
        if (pinnedHighlight === null) { return; }
        if (getUserInteractionEpoch() === pinnedHighlight.epoch) { return; }
        pinnedHighlight = null;
        applyActiveHeading(getActiveHeadingPos());
    }

    function rebindFromDocument(): void {
        const view = getEditorView();
        if (!view) return;
        const headings = getHeadings(view);
        const visible = visibleHeadingIndices(headings);

        if (renderSignature(headings, visible) !== renderedSignature) { return; }
        bindPositions(view, headings, visible);
    }

    const header = document.createElement("div");
    header.className = "toc-header";

    const headerTitle = document.createElement("span");
    headerTitle.className = "toc-header-title";

    headerTitle.textContent = t("Contents");
    header.appendChild(headerTitle);

    const list = document.createElement("div");
    list.className = "toc-list";

    panel.appendChild(header);
    panel.appendChild(list);

    const tabEl = document.createElement("button");
    tabEl.className = "toc-toggle-tab";
    tabEl.tabIndex = -1;
    document.body.appendChild(tabEl);

    let isOpen = false;
    let dismissedByUser = false;
    let panelWidth = TOC_WIDTH;

    const savedState = getWebviewState();
    if (savedState?.tocDismissed === true) { dismissedByUser = true; }
    if (savedState?.tocWidth && typeof savedState.tocWidth === "number") {
        panelWidth = Math.min(TOC_MAX_WIDTH, Math.max(TOC_MIN_WIDTH, savedState.tocWidth));
    }
    panel.style.width = `${panelWidth}px`;

    const collapsedHeadings = new Set<string>();
    if (Array.isArray(savedState?.tocCollapsed)) {
        for (const key of savedState.tocCollapsed) {

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

    function foldStateOf(headings: HeadingEntry[], idx: number): string {
        if (!hasChildren(headings, idx)) { return "-"; }
        return collapsedHeadings.has(headings[idx].key) ? "closed" : "open";
    }

    function renderSignature(headings: HeadingEntry[], visible: number[]): string {
        return visible.map((idx) => `${headings[idx].key}|${foldStateOf(headings, idx)}`).join("\n");
    }

    function visibleHeadingIndices(headings: HeadingEntry[]): number[] {
        const visible: number[] = [];
        for (let idx = 0; idx < headings.length; idx++) {
            if (isHeadingVisible(headings, idx, collapsedHeadings)) { visible.push(idx); }
        }
        return visible;
    }

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

            toggle.textContent = "–";
        }
        item.appendChild(toggle);

        const label = document.createElement("span");
        label.className = "toc-item-label";
        label.textContent = h.text || `${t("Heading")} ${h.level}`;
        applyTooltip(label, h.text, { placement: "above", truncatedOnly: true });

        item.appendChild(label);

        item.addEventListener("mousedown", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const v = getEditorView();
            if (!v) return;
            try {

                const el = headingEls.get(item);
                if (!el || !v.dom.contains(el)) return;
                const targetPos = posByItem.get(item);
                if (targetPos === undefined) return;
                const topbarH = topbarHeight();

                hideStickyUntilNextInteraction();

                const top = headingScrollTop(
                    el.getBoundingClientRect().top + window.scrollY,
                    topbarH,
                );

                pinnedHighlight = pinHeadingHighlight(targetPos, getUserInteractionEpoch());
                applyActiveHeading(targetPos);
                window.scrollTo({ top, behavior: "smooth" });
            } catch {}
        });

        return item;
    }

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

        if (signature === renderedSignature) {
            bindPositions(view, headings, visible);
            applyActiveHeading(getActiveHeadingPos());
            return;
        }

        renderedSignature = signature;
        list.innerHTML = "";
        renderedItems = [];

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

        if (isOpen) {
            document.body.style.paddingLeft = `${panelWidth}px`;
            if (topbar) topbar.style.paddingLeft = `${panelWidth}px`;
        } else {
            document.body.style.paddingLeft = '';
            if (topbar) topbar.style.paddingLeft = '';
        }
    }

    function updateTabPos(): void {
        tabEl.style.transform = isOpen ? `translateX(${panelWidth}px)` : 'translateX(0px)';
        tabEl.textContent = isOpen ? "‹" : "›";
        tabEl.dataset.tocState = isOpen ? "open" : "closed";
        applyTooltip(tabEl, isOpen ? t("Collapse") : t("Expand"), { placement: "above" });
    }

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

    updateTabPos();
    requestAnimationFrame(() => {
        checkAutoShow();

        applyActiveHeading(getActiveHeadingPos());
    });

    window.addEventListener("resize", checkAutoShow);

    const unsubscribeActiveHeading = onActiveHeadingChange(applyActiveHeading);

    window.addEventListener("scroll", releasePinOnInteraction, { passive: true });
    for (const type of USER_INTERACTION_EVENT_TYPES) {
        window.addEventListener(type, releasePinOnInteraction, { passive: true });
    }

    function show(): void {
        panel.style.visibility = 'visible';
        tabEl.style.visibility = 'visible';
    }

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
