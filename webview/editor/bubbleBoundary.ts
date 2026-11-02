/**
 * Positioning for the inline-math edit bubble (pure, directly testable).
 *
 * Not floating-ui flip/shift: its clipping ancestors miss the fixed TOC, so the bubble
 * escaped the editing area; and flip sent it to the page top over the fixed toolbar (real
 * regression). Geometry: horizontal aligns to the formula's left and clamps into the
 * editing area; vertical goes below, then above, then clamps.
 */

/** Minimum gap (px) between the bubble and the editing-area bounds. */
export const BUBBLE_BOUNDARY_PADDING = 8;

/** Vertical gap (px) between the bubble and the formula. */
export const BUBBLE_GAP = 10;

/** Minimum width (px) when squeezed; anything narrower is unusable. */
export const BUBBLE_MIN_WIDTH = 120;

/** Floating rect (same shape as floating-ui's Rect). */
export interface BubbleRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** Geometry constraints of the editing area and viewport. */
export interface BubbleViewport {
    /** Editing-area left edge (= body padding-left while TOC is open, else 0). */
    contentLeft: number;
    /** Editing-area top (= bottom of the fixed toolbar, which must stay uncovered). */
    contentTop: number;
    viewportWidth: number;
    viewportHeight: number;
}

/** Result in viewport coordinates (for strategy: "fixed"). */
export interface BubblePosition {
    x: number;
    y: number;
}

/**
 * Place the bubble; the result always stays inside the editing area.
 *
 * @param reference Formula rect in viewport coordinates.
 * @param floating Bubble size.
 * @param view Editing-area and viewport constraints.
 */
export function placeBubble(
    reference: BubbleRect,
    floating: { width: number; height: number },
    view: BubbleViewport,
): BubblePosition {
    const pad = BUBBLE_BOUNDARY_PADDING;

    const minX = view.contentLeft + pad;
    const maxX = view.viewportWidth - floating.width - pad;
    const x = Math.max(minX, Math.min(reference.x, Math.max(minX, maxX)));

    const minY = view.contentTop + pad;
    const maxY = view.viewportHeight - floating.height - pad;

    const below = reference.y + reference.height + BUBBLE_GAP;
    const above = reference.y - floating.height - BUBBLE_GAP;

    let y: number;
    if (below + floating.height <= maxY) {
        y = below;
    } else if (above >= minY) {
        y = above;
    } else {
        y = Math.max(minY, Math.min(below, maxY));
    }

    return { x, y: Math.max(minY, Math.min(y, Math.max(minY, maxY))) };
}
