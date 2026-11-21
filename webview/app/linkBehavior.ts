
import { OPEN_URL_SCHEMES, extractUrlScheme } from "../../shared/constants";
import { anchorIdCandidates } from "../shell/anchorTarget";
import { headingScrollTop } from "../outline/headingScroll";
import { topbarHeight } from "../ui/topbarMetrics";


export interface LinkBehaviorDeps {
    openUrl(url: string): void;
    openFile(relativePath: string): void;
}

export function initLinkBehavior(container: HTMLElement, deps: LinkBehaviorDeps): void {

    container.addEventListener("click", (e) => {
        const anchor = (e.target as Element).closest("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href") ?? "";
        e.preventDefault();
        e.stopImmediatePropagation();
        if (href.startsWith("#")) {

            const el = anchorIdCandidates(href.slice(1))
                .map((id) => document.getElementById(id))
                .find((found): found is HTMLElement => found !== null);
            if (el) {

                const top = headingScrollTop(el.getBoundingClientRect().top + window.scrollY, topbarHeight());
                window.scrollTo({ top, behavior: "smooth" });
            }
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            const clean = href.split("#")[0];
            if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(clean)) {

                if (OPEN_URL_SCHEMES.has(extractUrlScheme(clean))) deps.openUrl(clean);
            }
            else deps.openFile(clean);
        }
    }, true);


    let linkTipCloseRaf = 0;
    window.addEventListener("scroll", () => {
        if (linkTipCloseRaf) return;
        linkTipCloseRaf = requestAnimationFrame(() => {
            linkTipCloseRaf = 0;
            const els = document.querySelectorAll(
                ".milkdown-link-preview, .milkdown-link-edit"
            );
            if (els.length === 0) return;
            els.forEach(el => {
                el.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
                requestAnimationFrame(() => {
                    const htmlEl = el as HTMLElement;
                    htmlEl.dataset.show = "false";
                });
            });
        });
    }, true);
}
