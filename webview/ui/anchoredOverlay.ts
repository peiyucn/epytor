


const DEFAULT_GAP_PX = 6;

const DEFAULT_VIEWPORT_MARGIN_PX = 8;

export interface AnchoredOverlayOptions {

    el: HTMLElement;

    anchor: HTMLElement;

    align?: "left" | "right";

    gap?: number;

    viewportMargin?: number;

    viewportRightMargin?: number;

    viewportWidth?: () => number;

    size?: { width: number; height: number };

    closeOn?: {
        escape?: boolean;
        outsideMousedown?: boolean;
        scroll?: boolean;
    };
}

export interface AnchoredOverlay {
    readonly el: HTMLElement;
    isOpen(): boolean;

    reposition(): void;

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


        left = Math.min(left, measureViewportWidth() - width - viewportRightMargin);
        left = Math.max(left, viewportMargin);

        let top = anchorRect.bottom + gap;
        if (top + height > window.innerHeight - viewportMargin) {

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
