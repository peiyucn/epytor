/**
 * Link and in-page anchor behaviour for the editor container.
 *
 * Anchor links are ids, not URLs: they scroll in place with the same top-bar baseline as the
 * TOC. Ctrl/Cmd+Click on a real link is handed to the extension, URL schemes through an
 * allowlist so `file:`/`javascript:`/custom protocols never reach the host. Also closes the
 * upstream link tooltip on scroll (rAF-throttled, no-op while none is open).
 *
 * Extracted from index.ts (audit F1): it only needs the container plus two notifiers.
 */
import { OPEN_URL_SCHEMES, extractUrlScheme } from "../../shared/constants";
import { anchorIdCandidates } from "../shell/anchorTarget";
import { headingScrollTop } from "../outline/headingScroll";
import { topbarHeight } from "../ui/topbarMetrics";

/** Injected so the module is directly testable without mocking the messaging channel. */
export interface LinkBehaviorDeps {
    openUrl(url: string): void;
    openFile(relativePath: string): void;
}

export function initLinkBehavior(container: HTMLElement, deps: LinkBehaviorDeps): void {
    // Capture phase: ProseMirror and the link tooltip also listen and would swallow the click.
    container.addEventListener("click", (e) => {
        const anchor = (e.target as Element).closest("a");
        if (!anchor) return;
        const href = anchor.getAttribute("href") ?? "";
        e.preventDefault();
        e.stopImmediatePropagation();
        if (href.startsWith("#")) {
            // Raw then percent-decoded ids: non-ASCII anchors are often percent-encoded.
            const el = anchorIdCandidates(href.slice(1))
                .map((id) => document.getElementById(id))
                .find((found): found is HTMLElement => found !== null);
            if (el) {
                // Same baseline as the active-heading check, else the TOC highlight stops one item early.
                const top = headingScrollTop(el.getBoundingClientRect().top + window.scrollY, topbarHeight());
                window.scrollTo({ top, behavior: "smooth" });
            }
            return;
        }
        if (e.ctrlKey || e.metaKey) {
            const clean = href.split("#")[0];
            if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:\/\//.test(clean)) {
                // Scheme allowlist: file:/javascript:/custom protocols never reach the Extension.
                if (OPEN_URL_SCHEMES.has(extractUrlScheme(clean))) deps.openUrl(clean);
            }
            else deps.openFile(clean);
        }
    }, true);

    // Close link tooltips on scroll, rAF-throttled and a no-op without open tooltips.
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
