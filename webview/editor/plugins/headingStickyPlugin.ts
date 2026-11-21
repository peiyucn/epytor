
import { Plugin } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import type { EditorView } from "@milkdown/kit/prose/view";
import { DEFAULT_TOPBAR_HEIGHT } from "../../../shared/constants";
import { IconChevronDown, IconChevronRight } from "../../ui/icons";
import { applyTooltip, hideTooltip } from "../../ui/tooltip";
import { t } from "../../i18n";
import { headingFoldPluginKey, type HeadingFoldMeta } from "./headingFoldPlugin";
import { shouldSkipViewportWork } from "../../scroll/viewportLedger";
import { buildHeadingIndex, type HeadingIndexEntry } from "../../outline/headingFold";
import { computeStickyRows, currentHeadingIndex, effectiveReadingLineY, STICKY_MAX_ROWS, STICKY_ROW_HEIGHT_PX } from "../../outline/headingSticky";
import { headingScrollTop } from "../../outline/headingScroll";
import { getUserInteractionEpoch } from "../../shell/userInteraction";

let _hideStickyUntilNextInteraction: (() => void) | null = null;

const activeHeading = {

    pos: null as number | null,
    listeners: new Set<(pos: number | null) => void>(),

    owner: null as object | null,
};

export function onActiveHeadingChange(listener: (pos: number | null) => void): () => void {
    activeHeading.listeners.add(listener);
    return () => { activeHeading.listeners.delete(listener); };
}

export function getActiveHeadingPos(): number | null {
    return activeHeading.pos;
}

function publishActiveHeading(pos: number | null): void {
    if (pos === activeHeading.pos) { return; }
    activeHeading.pos = pos;
    for (const listener of activeHeading.listeners) { listener(pos); }
}

export function hideStickyUntilNextInteraction(): void {
    _hideStickyUntilNextInteraction?.();
}

function getTopbarBottom(): number {
    const topBar = document.querySelector(".milkdown-top-bar");
    return topBar?.getBoundingClientRect().bottom ?? DEFAULT_TOPBAR_HEIGHT;
}

function getTopLevelHeadings(view: EditorView): Array<{ el: HTMLElement; entry: HeadingIndexEntry }> {
    const out: Array<{ el: HTMLElement; entry: HeadingIndexEntry }> = [];
    for (const entry of buildHeadingIndex(view.state.doc)) {
        if (!entry.topLevel) continue;
        const el = view.nodeDOM(entry.pos);
        if (el instanceof HTMLElement) out.push({ el, entry });
    }
    return out;
}

export const headingStickyPlugin = $prose(() =>
    new Plugin({
        view(view) {
            const instanceToken = {};
            activeHeading.owner = instanceToken;
            const sticky = document.createElement("div");
            sticky.className = "heading-sticky-title";
            sticky.hidden = true;
            sticky.style.display = "none";
            sticky.style.setProperty("--epytor-sticky-row-height", `${STICKY_ROW_HEIGHT_PX}px`);
            document.body.appendChild(sticky);

            let rafId: number | null = null;

            let suppressSticky = false;
            let suppressEpoch: number | null = null;

            const CACHE_REBUILD_DEBOUNCE_MS = 300;

            const suppressUntilNextInteraction = (): void => {
                suppressSticky = true;
                suppressEpoch = getUserInteractionEpoch();
                hideSticky();
            };
            _hideStickyUntilNextInteraction = suppressUntilNextInteraction;

            const scrollHeadingIntoStickyPosition = (headingPos: number) => {
                requestAnimationFrame(() => {
                    const heading = view.nodeDOM(headingPos);
                    if (!(heading instanceof HTMLElement)) return;

                    const top = headingScrollTop(
                        heading.getBoundingClientRect().top + window.scrollY,
                        getTopbarBottom(),
                    );
                    window.scrollTo({ top });
                });
            };

            sticky.addEventListener("click", (event) => {
                const target = event.target as HTMLElement | null;
                if (target?.closest(".heading-sticky-toggle")) return;
                const row = target?.closest<HTMLElement>(".heading-sticky-row");
                const pos = Number(row?.dataset["headingPos"]);

                if (Number.isFinite(pos) && pos >= 0) {
                    suppressUntilNextInteraction();
                    scrollHeadingIntoStickyPosition(pos);
                }
            });

            const makeFoldToggle = (headingPos: number, collapsed: boolean): HTMLButtonElement => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "heading-sticky-toggle";
                button.innerHTML = collapsed ? IconChevronRight : IconChevronDown;
                const tipText = collapsed ? t("Expand content") : t("Collapse content");
                button.setAttribute("aria-label", tipText);
                button.setAttribute("aria-expanded", collapsed ? "false" : "true");
                applyTooltip(button, tipText, { placement: "above" });
                button.addEventListener("mousedown", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                });
                button.addEventListener("click", (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const tr = view.state.tr
                        .setMeta(headingFoldPluginKey, {
                            type: "toggle",
                            pos: headingPos,
                        } satisfies HeadingFoldMeta)
                        .setMeta("addToHistory", false);
                    view.dispatch(tr);
                    view.focus();
                    hideTooltip();
                    scrollHeadingIntoStickyPosition(headingPos);
                });
                return button;
            };

            const hideSticky = () => {
                sticky.hidden = true;

                sticky.style.display = "none";
                lastRowSignature = "";
            };

            interface CachedHeading {
                el: HTMLElement;
                pos: number;
                level: number;

                depth: number;
                text: string;
                foldable: boolean;
                docTop: number;

                docSectionBottom: number;
            }
            let cachedHeadings: CachedHeading[] = [];
            let cacheDirty = true;
            let rebuildTimer: ReturnType<typeof setTimeout> | null = null;
            let lastRowSignature = "";

            const clearRebuildTimer = () => {
                if (rebuildTimer !== null) {
                    clearTimeout(rebuildTimer);
                    rebuildTimer = null;
                }
            };

            const rebuildCache = () => {
                clearRebuildTimer();
                const scrollOffset = window.scrollY;
                const contentBottom = view.dom.getBoundingClientRect().bottom + scrollOffset;
                const levelStack: number[] = [];
                cachedHeadings = [];
                for (const { el, entry } of getTopLevelHeadings(view)) {
                    while (levelStack.length > 0 && levelStack[levelStack.length - 1] >= entry.level) {
                        levelStack.pop();
                    }
                    levelStack.push(entry.level);
                    const depth = levelStack.length;
                    const rect = el.getBoundingClientRect();
                    if (!(rect.width > 0 && rect.height > 0)) continue;
                    if (el.classList.contains("heading-fold-hidden")) continue;
                    cachedHeadings.push({
                        el,
                        pos: entry.pos,
                        level: entry.level,
                        depth,
                        text: entry.text,
                        foldable: entry.foldRange !== null,
                        docTop: rect.top + scrollOffset,
                        docSectionBottom: contentBottom,
                    });
                }
                const pending: number[] = [];
                for (let i = 0; i < cachedHeadings.length; i++) {
                    while (pending.length > 0
                        && cachedHeadings[pending[pending.length - 1]].level >= cachedHeadings[i].level) {
                        cachedHeadings[pending.pop()!].docSectionBottom = cachedHeadings[i].docTop;
                    }
                    pending.push(i);
                }
                cacheDirty = false;
            };

            let lastStableBodyWidth = -1;

            const markCacheDirty = () => {
                cacheDirty = true;
                clearRebuildTimer();
                rebuildTimer = setTimeout(() => {
                    rebuildTimer = null;

                    if (shouldSkipViewportWork()) { return; }
                    rebuildCache();
                    scheduleUpdate();
                }, CACHE_REBUILD_DEBOUNCE_MS);
            };

            const onLayoutChange = () => {
                if (shouldSkipViewportWork()) return;
                const bodyWidth = document.body.getBoundingClientRect().width;
                if (cacheDirty || Math.abs(bodyWidth - lastStableBodyWidth) > 0.5) {
                    markCacheDirty();
                }
                lastStableBodyWidth = bodyWidth;
                scheduleUpdate();
            };

            const maxStickyRows = (): number => Math.min(
                STICKY_MAX_ROWS,
                Math.max(1, Math.floor((window.innerHeight * 0.25) / STICKY_ROW_HEIGHT_PX)),
            );

            const renderRows = (indices: number[]): void => {
                const folded = headingFoldPluginKey.getState(view.state);
                const frag = document.createDocumentFragment();
                for (const idx of indices) {
                    const cached = cachedHeadings[idx];
                    const row = document.createElement("div");
                    row.className = "heading-sticky-row";
                    row.dataset["headingPos"] = String(cached.pos);
                    if (cached.foldable) {
                        row.appendChild(makeFoldToggle(cached.pos, folded?.has(cached.pos) ?? false));
                    }
                    const marker = document.createElement("span");
                    marker.className = "heading-sticky-marker";
                    marker.textContent = "#".repeat(cached.level);
                    const label = document.createElement("span");
                    label.className = "heading-sticky-text";
                    label.textContent = cached.text;
                    row.append(marker, label);
                    frag.appendChild(row);
                }
                sticky.replaceChildren(frag);
            };

            const updateSticky = () => {
                rafId = null;
                const topbarBottom = getTopbarBottom();

                if (cacheDirty) { rebuildCache(); }
                if (cachedHeadings.length > 0) {
                    const scrollY = window.scrollY;
                    const activeIndex = currentHeadingIndex(
                        cachedHeadings.map((h) => ({ depth: h.depth, top: h.docTop - scrollY, sectionBottom: 0 })),

                        effectiveReadingLineY(
                            topbarBottom,
                            window.innerHeight,
                            scrollY,
                            document.documentElement.scrollHeight,
                        ),
                    );
                    publishActiveHeading(activeIndex >= 0 ? cachedHeadings[activeIndex].pos : null);
                }

                if (suppressSticky) {
                    if (suppressEpoch !== null && getUserInteractionEpoch() !== suppressEpoch) {
                        suppressSticky = false;
                        suppressEpoch = null;
                    } else {
                        hideSticky();
                        return;
                    }
                }

                if (cachedHeadings.length === 0) {
                    hideSticky();
                    return;
                }

                const scrollY = window.scrollY;
                const rows = computeStickyRows(
                    cachedHeadings.map((h) => ({
                        depth: h.depth,
                        top: h.docTop - scrollY,
                        sectionBottom: h.docSectionBottom - scrollY,
                    })),
                    topbarBottom,
                    STICKY_ROW_HEIGHT_PX,
                    maxStickyRows(),
                );
                if (rows.length === 0) {
                    hideSticky();
                    return;
                }

                const innermost = cachedHeadings[rows[rows.length - 1]];
                const rect = innermost.el.getBoundingClientRect();
                sticky.hidden = false;
                sticky.style.display = "";
                sticky.style.top = `${topbarBottom}px`;
                sticky.style.left = `${rect.left}px`;
                sticky.style.width = `${rect.width}px`;

                const folded = headingFoldPluginKey.getState(view.state);
                const signature = rows
                    .map((idx) => `${cachedHeadings[idx].pos}:${folded?.has(cachedHeadings[idx].pos) ? 1 : 0}`)
                    .join(",");
                if (signature !== lastRowSignature) {
                    lastRowSignature = signature;
                    renderRows(rows);
                }
            };

            const scheduleUpdate = () => {
                if (shouldSkipViewportWork()) return;
                if (rafId !== null) return;
                rafId = requestAnimationFrame(updateSticky);
            };

            const clearSuppress = () => {
                if (suppressSticky) { scheduleUpdate(); }
            };

            const resizeObserver = new ResizeObserver(() => {
                if (shouldSkipViewportWork()) return;
                markCacheDirty();
            });
            resizeObserver.observe(view.dom);

            const layoutObserver = new ResizeObserver(onLayoutChange);
            layoutObserver.observe(document.body, { box: "content-box" });

            window.addEventListener("scroll", scheduleUpdate, { passive: true });
            window.addEventListener("resize", scheduleUpdate);
            window.addEventListener("wheel", clearSuppress, { passive: true });
            window.addEventListener("touchmove", clearSuppress, { passive: true });
            window.addEventListener("keydown", clearSuppress);
            scheduleUpdate();

            return {
                update(view, prevState) {

                    const docChanged = !view.state.doc.eq(prevState.doc);
                    const foldChanged =
                        headingFoldPluginKey.getState(view.state) !==
                        headingFoldPluginKey.getState(prevState);
                    if (docChanged || foldChanged) {
                        markCacheDirty();
                    }
                },
                destroy() {
                    if (rafId !== null) cancelAnimationFrame(rafId);
                    clearRebuildTimer();
                    if (_hideStickyUntilNextInteraction === suppressUntilNextInteraction) {
                        _hideStickyUntilNextInteraction = null;
                    }

                    if (activeHeading.owner === instanceToken) {
                        activeHeading.owner = null;
                        publishActiveHeading(null);
                    }
                    window.removeEventListener("scroll", scheduleUpdate);
                    window.removeEventListener("resize", scheduleUpdate);
                    window.removeEventListener("wheel", clearSuppress);
                    window.removeEventListener("touchmove", clearSuppress);
                    window.removeEventListener("keydown", clearSuppress);
                    resizeObserver.disconnect();
                    layoutObserver.disconnect();
                    sticky.remove();
                },
            };
        },
    }),
);
