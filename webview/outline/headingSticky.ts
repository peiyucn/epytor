/**
 * Sticky heading rows (pure geometry, jsdom-testable).
 *
 * Row `d` sits at `topbarBottom + (d-1) * rowHeight` and shows the heading whose top has
 * passed that row but whose section has not ended; same-depth sections never overlap, so
 * at most one heading hits each row. Regression: taking the last heading fully scrolled
 * past the top bar switched a heading-height late and only supported one level. The tail
 * is intentionally not adopted: a trailing section shorter than a screen never reaches a
 * row, so the previous heading stays until the next one hits the line.
 */

export interface StickyHeadingRect {
    /** Nesting level (1 = top level). */
    depth: number;
    /** Viewport-space top edge. */
    top: number;
    /** Viewport-space bottom of this section (next heading with level <= this one, or content end). */
    sectionBottom: number;
}

/** Row height in px; kept in sync with CSS `--epytor-sticky-row-height`. */
export const STICKY_ROW_HEIGHT_PX = 22;
/** Deeper levels would eat reading space. */
export const STICKY_MAX_ROWS = 3;

/** Indices (outer -> inner) of the headings to pin; empty means no sticky rows. */
export function computeStickyRows(
    headings: StickyHeadingRect[],
    topbarBottom: number,
    rowHeight: number = STICKY_ROW_HEIGHT_PX,
    maxRows: number = STICKY_MAX_ROWS,
): number[] {
    const rows: number[] = [];
    for (let depth = 1; depth <= maxRows; depth++) {
        const rowY = topbarBottom + (depth - 1) * rowHeight;
        let hit = -1;
        for (let i = 0; i < headings.length; i++) {
            const h = headings[i];
            if (h.depth !== depth) continue;
            if (h.top < rowY && rowY <= h.sectionBottom) { hit = i; }
        }
        if (hit >= 0) { rows.push(hit); }
    }
    return rows;
}

/**
 * Index of the current-section heading (last top edge past the reading line), or -1.
 * Not the innermost sticky row: while two sections swap, that row briefly falls back to
 * the parent and TOC highlighting jumps backwards (regression: highlight jitter). This
 * test only looks at the top edge, so it advances monotonically.
 */
export function currentHeadingIndex(
    headings: StickyHeadingRect[],
    readingLineY: number,
): number {
    let hit = -1;
    for (let i = 0; i < headings.length; i++) {
        if (headings[i].top < readingLineY) { hit = i; } else { break; }
    }
    return hit;
}

/**
 * Reading-line viewport y: normally the sticky line (top bar bottom), sliding down with
 * the remaining scroll inside the unreachable tail, ending at the viewport bottom.
 * Why: the last `viewportHeight - topbarBottom` px can never reach the sticky line, so a
 * fixed line left the highlight on the second-to-last heading and skipped middle tail
 * entries (regression). Degenerate cases (no band, no scroll room, jsdom's zero
 * scrollHeight) keep the sticky line.
 */
export function effectiveReadingLineY(
    topbarBottom: number,
    viewportHeight: number,
    scrollY: number,
    contentHeight: number,
): number {
    const band = viewportHeight - topbarBottom;
    const maxScroll = contentHeight - viewportHeight;
    if (band <= 0 || maxScroll <= 0) { return topbarBottom; }
    const fromBottom = Math.max(0, maxScroll - scrollY);
    if (fromBottom >= band) { return topbarBottom; }
    return Math.min(viewportHeight, topbarBottom + (band - fromBottom));
}
