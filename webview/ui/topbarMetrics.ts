
import { DEFAULT_TOPBAR_HEIGHT } from "../../shared/constants";


export function topbarHeight(): number {
    return document.querySelector(".milkdown-top-bar")?.getBoundingClientRect().height
        ?? DEFAULT_TOPBAR_HEIGHT;
}
