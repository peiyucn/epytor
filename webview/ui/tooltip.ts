const TOOLTIP_SPACING_PX = 6;
const TOOLTIP_VIEWPORT_MARGIN_PX = 4;

let tooltipEl: HTMLElement | null = null;

function getTooltip(): HTMLElement {
    if (!tooltipEl) {
        tooltipEl = document.createElement("div");
        tooltipEl.className = "custom-tooltip";
        document.body.appendChild(tooltipEl);
    }
    return tooltipEl;
}

interface TooltipOptions {
    /** 'below' (default, used by the top bar) or 'above'. */
    placement?: "above" | "below";
    /** Only show when the text is truncated (an ellipsis is rendered). */
    truncatedOnly?: boolean;
}

interface TooltipHandle {
    /** Update the text without touching visibility. */
    setText(t: string): void;
    /** Show right away (e.g. click feedback). */
    show(): void;
}

export interface TooltipHorizontalPos {
    left?: string;
    right?: string;
}

/**
 * Horizontal placement (pure, unit-tested): a button on the right half aligns the tooltip's
 * right edge to the button's, which can never overflow the viewport (regression: the findBar's
 * last button's tooltip was clipped off-screen); a button on the left half aligns left edges
 * and grows rightwards, bounded by CSS max-width.
 */
export function computeTooltipHorizontal(
    el: { left: number; right: number },
    viewportWidth: number,
): TooltipHorizontalPos {
    if (el.right > viewportWidth / 2) {
        return {
            right: `${Math.max(TOOLTIP_VIEWPORT_MARGIN_PX, viewportWidth - el.right)}px`,
        };
    }
    return {
        left: `${Math.max(TOOLTIP_VIEWPORT_MARGIN_PX, el.left)}px`,
    };
}

function position(
    tip: HTMLElement,
    el: HTMLElement,
    placement: "above" | "below",
): void {
    tip.style.visibility = "hidden";
    tip.style.display = "block";

    const elRect = el.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();

    const horizontal = computeTooltipHorizontal(
        { left: elRect.left, right: elRect.right },
        window.innerWidth,
    );
    if (horizontal.left !== undefined) {
        tip.style.left = horizontal.left;
        tip.style.right = "auto";
    } else {
        tip.style.left = "auto";
        tip.style.right = horizontal.right!;
    }

    let y: number;
    if (placement === "above") {
        y = elRect.top - tipRect.height - TOOLTIP_SPACING_PX;
        if (y < TOOLTIP_VIEWPORT_MARGIN_PX) {
            y = elRect.bottom + TOOLTIP_SPACING_PX;
        } // Not enough room above: drop below.
    } else {
        y = elRect.bottom + TOOLTIP_SPACING_PX;
        if (y + tipRect.height > window.innerHeight - TOOLTIP_VIEWPORT_MARGIN_PX) {
            y = elRect.top - tipRect.height - TOOLTIP_SPACING_PX;
        }
    }
    tip.style.top = `${y}px`;

    // Read-back guard: if measurement or CSS error still overflows the viewport, pin to an edge.
    const finalRect = tip.getBoundingClientRect();
    if (finalRect.width > 0 && finalRect.right > window.innerWidth - TOOLTIP_VIEWPORT_MARGIN_PX) {
        tip.style.left = "auto";
        tip.style.right = `${TOOLTIP_VIEWPORT_MARGIN_PX}px`;
    } else if (finalRect.width > 0 && finalRect.left < TOOLTIP_VIEWPORT_MARGIN_PX) {
        tip.style.left = `${TOOLTIP_VIEWPORT_MARGIN_PX}px`;
        tip.style.right = "auto";
    }

    tip.style.visibility = "visible";
}

/** Hide the visible tooltip immediately (used to clear it after a click interaction). */
export function hideTooltip(): void {
    if (tooltipEl) {
        tooltipEl.style.display = "none";
    }
}

/** Imperative show next to an element, with no event binding. */
export function showTooltipAt(
    el: Element,
    text: string,
    placement: "above" | "below" = "above",
): void {
    const tip = getTooltip();
    tip.textContent = text;
    position(tip, el as HTMLElement, placement);
}

/** Replace the native `title` attribute with a VS Code-style custom tooltip. */
export function applyTooltip(
    el: HTMLElement,
    text: string,
    options: TooltipOptions = {},
): TooltipHandle {
    const { placement = "above", truncatedOnly = false } = options;
    let currentText = text;

    el.removeAttribute("title");

    el.addEventListener("mouseenter", () => {
        if (!currentText) {
            return;
        }
        if (truncatedOnly && el.scrollWidth <= el.offsetWidth) {
            return;
        }
        const tip = getTooltip();
        tip.textContent = currentText;
        position(tip, el, placement);
    });

    el.addEventListener("mouseleave", () => {
        if (tooltipEl) {
            tooltipEl.style.display = "none";
        }
    });

    return {
        setText(t: string) {
            currentText = t;
        },
        show() {
            if (!currentText) {
                return;
            }
            const tip = getTooltip();
            tip.textContent = currentText;
            position(tip, el, placement);
        },
    };
}
