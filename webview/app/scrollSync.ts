/**
 * Source-line ↔ viewport geometry.
 *
 * The webview shows one ProseMirror block per markdown source line range, so mapping a
 * line to a scroll offset needs the block elements in document order plus the line map
 * the extension sends (see `lineMapUpdate`).
 */
import type { EditorView } from "@milkdown/kit/prose/view";
import { VIEWPORT_PADDING } from "../../shared/constants";
import { topbarHeight } from "../ui/topbarMetrics";

/** Content blocks in order, 1:1 with the line map. Not `view.dom.children`: widget
 *  decorations shift them (the first child is an empty widget). */
export function getContentBlockElements(view: EditorView): HTMLElement[] {
    const elements: HTMLElement[] = [];
    view.state.doc.forEach((_node, offset) => {
        const dom = view.nodeDOM(offset);
        if (dom instanceof HTMLElement) { elements.push(dom); }
    });
    return elements;
}

/** Sticky heading bar height (0 when unstuck); subtract it or the target hides underneath. */
export function stickyBarHeight(): number {
    const sticky = document.querySelector<HTMLElement>(".heading-sticky-title");
    if (!sticky || sticky.hidden) { return 0; }
    return sticky.getBoundingClientRect().height;
}

/** Scroll the 1-indexed source line to the viewport top, interpolating inside blocks like
 *  VS Code's preview so a long block lands on the right line. */
export function scrollToSourceLine(
    view: EditorView,
    lineMap: number[],
    lineEndMap: number[],
    targetLine: number,
): void {
    if (!lineMap.length) { return; }
    const children = getContentBlockElements(view);
    const topbarH = topbarHeight();
    const docTop = (el: HTMLElement) => el.getBoundingClientRect().top + window.scrollY;

    let prevIdx = -1;
    for (let i = 0; i < lineMap.length && i < children.length; i++) {
        if (lineMap[i] <= targetLine) { prevIdx = i; } else { break; }
    }
    if (prevIdx < 0) { window.scrollTo({ top: 0 }); return; }
    const prevEl = children[prevIdx];
    if (!prevEl) { return; }
    const prevTop = docTop(prevEl);
    const prevEnd = lineEndMap[prevIdx] ?? lineMap[prevIdx];
    const nextIdx = prevIdx + 1;

    let target: number;
    if (targetLine <= prevEnd) {
        const span = Math.max(1, prevEnd - lineMap[prevIdx]);
        const frac = Math.min(Math.max((targetLine - lineMap[prevIdx]) / span, 0), 1);
        target = prevTop + prevEl.getBoundingClientRect().height * frac;
    } else if (nextIdx < lineMap.length && nextIdx < children.length) {
        const nextEl = children[nextIdx];
        const prevBottom = prevTop + prevEl.getBoundingClientRect().height;
        const nextTop = docTop(nextEl);
        const span = Math.max(1, lineMap[nextIdx] - prevEnd);
        const frac = Math.min(Math.max((targetLine - prevEnd) / span, 0), 1);
        target = prevBottom + (nextTop - prevBottom) * frac;
    } else {
        target = prevTop;
    }

    const place = () => window.scrollTo({ top: target - topbarH - stickyBarHeight() - VIEWPORT_PADDING });
    place();
    // Sticky height is only known after scrolling; correct once the plugin updates it.
    requestAnimationFrame(() => {
        if (stickyBarHeight() > 0) { place(); }
    });
}

/** First source line visible under the top bar, interpolated within the block it lands in. */
export function visibleSourceLine(
    view: EditorView,
    lineMap: number[],
    lineEndMap: number[],
): number {
    if (!lineMap.length) { return 1; }
    const children = getContentBlockElements(view);
    const anchorY = topbarHeight() + stickyBarHeight() + VIEWPORT_PADDING;
    for (let i = 0; i < children.length && i < lineMap.length; i++) {
        const rect = children[i].getBoundingClientRect();
        if (rect.bottom > anchorY) {
            const start = lineMap[i] ?? 1;
            const end = lineEndMap[i] ?? start;
            if (end > start && rect.top < anchorY) {
                const frac = Math.min(Math.max((anchorY - rect.top) / Math.max(1, rect.height), 0), 1);
                return Math.round(start + frac * (end - start));
            }
            return start;
        }
    }
    return lineMap[Math.min(lineMap.length - 1, children.length - 1)] ?? 1;
}

/** Prefer the nav line the extension asked for while the viewport still sits on its block,
 *  else the visible line — otherwise switching modes drifts by a line each round trip. */
export function switchTargetLine(
    view: EditorView,
    lineMap: number[],
    lineEndMap: number[],
    lastNavLine: number | null,
): number | undefined {
    const visible = visibleSourceLine(view, lineMap, lineEndMap);
    if (lastNavLine === null) { return visible; }
    let blockStart = 0;
    for (const line of lineMap) {
        if (line <= lastNavLine) { blockStart = line; } else { break; }
    }
    return blockStart === visible ? lastNavLine : visible;
}
