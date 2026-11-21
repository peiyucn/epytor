


export const BUBBLE_BOUNDARY_PADDING = 8;


export const BUBBLE_GAP = 10;


export const BUBBLE_MIN_WIDTH = 120;


export interface BubbleRect {
    x: number;
    y: number;
    width: number;
    height: number;
}


export interface BubbleViewport {

    contentLeft: number;

    contentTop: number;
    viewportWidth: number;
    viewportHeight: number;
}


export interface BubblePosition {
    x: number;
    y: number;
}


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
