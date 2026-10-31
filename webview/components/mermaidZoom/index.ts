/**
 * Mermaid preview zoom: SVG width scaling in the DOM plus a control bar (＋/−/×).
 * Never touches document content; the host re-invokes it after a theme re-render.
 */
import "./mermaidZoom.css";
import { clampZoom, MERMAID_ZOOM_STEP } from "@/code/mermaidZoom";
import { t } from "@/i18n";
import { IconResetZoom } from "@/ui/icons";

const DEFAULT_ZOOM = 0.8;

/**
 * SVG's rendered base width in px.
 * Regression: zoom used to write a container percentage (80%) regardless of the SVG's own
 * rendered size, so wide containers appeared "zoomed in" and only the minimum looked normal.
 */
function measureSvgBaseWidth(svg: SVGElement): number {
    const rect = svg.getBoundingClientRect();
    if (Number.isFinite(rect.width) && rect.width > 0) return rect.width;
    const attr = Number.parseFloat(svg.getAttribute("width") ?? "");
    if (Number.isFinite(attr) && attr > 0) return attr;
    return 0;
}

/** Inject the control bar into a rendered mermaid preview; the ratio persists in the container dataset. */
export function enhanceMermaidPreview(container: HTMLElement, svg: SVGElement): void {
    // Do not mount twice (a theme re-render may re-enter before the old bar is cleaned up).
    if (container.querySelector(".epytor-mermaid-zoom-bar")) return;
    const savedZoom = Number(container.dataset["epytorMermaidZoom"]);
    // Default 0.8× (mermaid's native size is large); reuse a previously saved ratio if any.
    let zoom = Number.isFinite(savedZoom) && savedZoom > 0 ? savedZoom : DEFAULT_ZOOM;
    const baseWidth = measureSvgBaseWidth(svg);

    const bar = document.createElement("div");
    bar.className = "epytor-mermaid-zoom-bar";

    const mkBtn = (
        content: string,
        title: string,
        onClick: () => void,
    ): HTMLButtonElement => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "epytor-mermaid-zoom-btn";
        btn.innerHTML = content;
        btn.title = title;
        btn.setAttribute("aria-label", title);
        btn.addEventListener("click", onClick);
        return btn;
    };

    const apply = (): void => {
        if (baseWidth > 0) {
            // Pixel scaling from the rendered base width: 1× means "original size".
            svg.style.width = `${baseWidth * zoom}px`;
            // mermaid sets an inline max-width (useMaxWidth); zooming in only works without it.
            svg.style.maxWidth = "none";
        } else {
            // No layout (jsdom/extreme cases): fall back to container percentages.
            svg.style.width = `${zoom * 100}%`;
            svg.style.maxWidth = `${zoom * 100}%`;
        }
        container.dataset["epytorMermaidZoom"] = String(zoom);
        bar.setAttribute("data-zoom", String(zoom));
    };

    const zoomIn = mkBtn("＋", t("Zoom In"), () => { zoom = clampZoom(zoom, MERMAID_ZOOM_STEP); apply(); });
    const zoomOut = mkBtn("－", t("Zoom Out"), () => { zoom = clampZoom(zoom, -MERMAID_ZOOM_STEP); apply(); });
    const zoomReset = mkBtn(IconResetZoom, t("Reset Zoom"), () => { zoom = DEFAULT_ZOOM; apply(); });

    bar.append(zoomIn, zoomOut, zoomReset);
    container.classList.add("epytor-mermaid-zoom-container");
    container.appendChild(bar);
    apply();
}
