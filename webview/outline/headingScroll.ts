/**
 * Scroll target for "jump to heading" (pure, jsdom-testable).
 *
 * Must share the reading line with `currentHeadingIndex()` in headingSticky.ts. Landing
 * the target exactly on the line is unstable (sub-pixel noise); landing it below the line
 * highlights the previous item (regression: TOC highlight unreliable after clicking).
 */

/** How far the target top goes past the reading line (px): just enough to beat sub-pixel noise. */
export const HEADING_JUMP_OVERLAP_PX = 2;

/**
 * Scroll top for jumping to a heading.
 *
 * @param headingDocTop Heading top in document space (viewport y + scrollY).
 * @param readingLineY Reading-line viewport y (top bar bottom; same source as `currentHeadingIndex`).
 */
export function headingScrollTop(headingDocTop: number, readingLineY: number): number {
    return Math.max(0, headingDocTop - readingLineY + HEADING_JUMP_OVERLAP_PX);
}
