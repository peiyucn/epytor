
import "./mermaidZoom.css";
import { clampZoom, MERMAID_ZOOM_STEP } from "@/code/mermaidZoom";
import { t } from "@/i18n";
import { IconResetZoom } from "@/ui/icons";

const DEFAULT_ZOOM = 0.8;

function measureSvgBaseWidth(svg: SVGElement): number {
    const rect = svg.getBoundingClientRect();
    if (Number.isFinite(rect.width) && rect.width > 0) return rect.width;
    const attr = Number.parseFloat(svg.getAttribute("width") ?? "");
    if (Number.isFinite(attr) && attr > 0) return attr;
    return 0;
}

export function enhanceMermaidPreview(container: HTMLElement, svg: SVGElement): void {

    if (container.querySelector(".epytor-mermaid-zoom-bar")) return;
    const savedZoom = Number(container.dataset["epytorMermaidZoom"]);

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

            svg.style.width = `${baseWidth * zoom}px`;

            svg.style.maxWidth = "none";
        } else {

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
