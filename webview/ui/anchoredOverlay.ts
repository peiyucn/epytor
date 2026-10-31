/**
 * Anchored overlay scaffold: a body-level popup placed next to an anchor element and dismissed
 * by Escape, an outside mousedown or a scroll.
 *
 * Extracted from the top-bar overflow menu and the table grid picker. Both had re-implemented
 * the same three dismissal listeners, the same "below the anchor, flipped when the viewport
 * bottom is reached" math and the same module-level listener bag — and the copies had already
 * drifted (right-aligned vs left-aligned clamping, documentElement vs window width, listener
 * removal duplicated in each `close`). The scaffold owns its listeners, measures its own size
 * and is idempotent to dispose, so a caller cannot leak a listener across an editor rebuild.
 */

/** Gap between the anchor and the overlay (both current callers use 6px). */
const DEFAULT_GAP_PX = 6;
/** Minimum distance kept from the viewport edges (both current callers use 8px). */
const DEFAULT_VIEWPORT_MARGIN_PX = 8;

export interface AnchoredOverlayOptions {
    /** Element to attach. The caller builds/populates it; it must not be in the document yet. */
    el: HTMLElement;
    /** Element the overlay is positioned against. */
    anchor: HTMLElement;
    /**
     * Which anchor edge the overlay aligns to: `left` starts at the anchor's left edge,
     * `right` ends at the anchor's right edge (the "⋯" menu is right-aligned).
     */
    align?: "left" | "right";
    /** Gap between the anchor and the overlay. */
    gap?: number;
    /** Minimum distance kept from every viewport edge. */
    viewportMargin?: number;
    /**
     * Right-edge margin for right-aligned overlays; defaults to `viewportMargin`.
     * The top-bar menu uses 12px so it never touches the window edge while the more button
     * itself sits at 8px.
     */
    viewportRightMargin?: number;
    /**
     * Width used for the right-edge clamp. Defaults to the layout viewport
     * (`documentElement.clientWidth`, which excludes a window scrollbar). The grid picker
     * historically clamps against `window.innerWidth`; callers must opt into that explicitly
     * instead of the scaffold silently picking one.
     */
    viewportWidth?: () => number;
    /**
     * Explicit overlay size. Used when the caller knows the size up front (fixed-size grid
     * picker) and must keep the exact historical clamp numbers; when omitted the overlay is
     * measured after attaching (variable-size overflow menu).
     */
    size?: { width: number; height: number };
    /** Dismissal triggers; every trigger defaults to enabled. */
    closeOn?: {
        escape?: boolean;
        outsideMousedown?: boolean;
        scroll?: boolean;
    };
}

export interface AnchoredOverlay {
    readonly el: HTMLElement;
    isOpen(): boolean;
    /**
     * Re-apply the position/clamp after the overlay content or the viewport changed.
     * Callers that position once at open time do not need it; it is part of the contract for
     * overlays whose content size changes while open.
     */
    reposition(): void;
    /** Remove the overlay and its listeners. Idempotent. */
    dispose(): void;
}

export function openAnchoredOverlay(options: AnchoredOverlayOptions): AnchoredOverlay {
    const {
        el,
        anchor,
        align = "left",
        gap = DEFAULT_GAP_PX,
        viewportMargin = DEFAULT_VIEWPORT_MARGIN_PX,
        size,
    } = options;
    const viewportRightMargin = options.viewportRightMargin ?? viewportMargin;
    const measureViewportWidth =
        options.viewportWidth ?? (() => document.documentElement.clientWidth);
    const closeOn = {
        escape: options.closeOn?.escape ?? true,
        outsideMousedown: options.closeOn?.outsideMousedown ?? true,
        scroll: options.closeOn?.scroll ?? true,
    };

    let open = true;

    function reposition(): void {
        const anchorRect = anchor.getBoundingClientRect();
        const width = size?.width ?? el.getBoundingClientRect().width;
        const height = size?.height ?? el.getBoundingClientRect().height;

        let left = align === "right" ? anchorRect.right - width : anchorRect.left;
        // Clamp into the viewport; the minimum wins when the overlay is wider than the viewport
        // so it stays reachable instead of being pushed off the left edge.
        left = Math.min(left, measureViewportWidth() - width - viewportRightMargin);
        left = Math.max(left, viewportMargin);

        let top = anchorRect.bottom + gap;
        if (top + height > window.innerHeight - viewportMargin) {
            // No room below: flip above the anchor (clamped so it cannot cover the top edge).
            top = Math.max(viewportMargin, anchorRect.top - height - gap);
        }

        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
            dispose();
        }
    };
    const onDocumentMousedown = (event: MouseEvent): void => {
        if (!el.contains(event.target as Node)) {
            dispose();
        }
    };
    const onScroll = (): void => {
        dispose();
    };

    function dispose(): void {
        if (!open) {
            return;
        }
        open = false;
        if (closeOn.escape) {
            document.removeEventListener("keydown", onKeyDown);
        }
        if (closeOn.outsideMousedown) {
            document.removeEventListener("mousedown", onDocumentMousedown, true);
        }
        if (closeOn.scroll) {
            window.removeEventListener("scroll", onScroll, true);
        }
        el.remove();
    }

    document.body.appendChild(el);
    reposition();

    if (closeOn.escape) {
        document.addEventListener("keydown", onKeyDown);
    }
    if (closeOn.outsideMousedown) {
        document.addEventListener("mousedown", onDocumentMousedown, true);
    }
    if (closeOn.scroll) {
        window.addEventListener("scroll", onScroll, true);
    }

    return {
        el,
        isOpen: () => open,
        reposition,
        dispose,
    };
}
