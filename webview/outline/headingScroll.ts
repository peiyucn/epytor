

export const HEADING_JUMP_OVERLAP_PX = 2;

export function headingScrollTop(headingDocTop: number, readingLineY: number): number {
    return Math.max(0, headingDocTop - readingLineY + HEADING_JUMP_OVERLAP_PX);
}
