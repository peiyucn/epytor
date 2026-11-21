

export interface StickyHeadingRect {

    depth: number;

    top: number;

    sectionBottom: number;
}

export const STICKY_ROW_HEIGHT_PX = 22;

export const STICKY_MAX_ROWS = 3;

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
