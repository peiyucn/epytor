/**
 * Top-bar geometry.
 *
 * The bar is `position: fixed` and its height comes from CSS, so any code that scrolls a
 * target into view has to subtract the measured height (falling back to the constant before
 * first layout). Three call sites had their own copy of this expression; one source keeps
 * them from drifting when the bar's padding changes.
 */
import { DEFAULT_TOPBAR_HEIGHT } from "../../shared/constants";

/** Measured height of the fixed top bar, or the design constant before layout. */
export function topbarHeight(): number {
    return document.querySelector(".milkdown-top-bar")?.getBoundingClientRect().height
        ?? DEFAULT_TOPBAR_HEIGHT;
}
