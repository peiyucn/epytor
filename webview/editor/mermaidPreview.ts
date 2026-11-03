/**
 * Mermaid code-block preview: lazy module load, keyed block registry and theme re-render.
 *
 * Mermaid (~1.3 MB minified) would dominate the entry chunk, so the module is imported on the
 * first block render. Rendered blocks are tracked by `data-mermaid-key`; the attribute is the
 * ownership token, which lets a theme switch redraw only blocks that still exist and lets
 * stale keys be pruned. The current theme is injected so this factory never owns theme state.
 *
 * Extracted from `createEditor` (audit F2) with the lazy-load and key behaviour unchanged.
 */
import { mermaidInitConfig } from "./mermaid";
import { enhanceMermaidPreview } from "../components/mermaidZoom";

type MermaidModule = typeof import("mermaid").default;
export type PreviewApply = (value: null | string | HTMLElement) => void;

export interface MermaidPreview {
    /**
     * Async code-block preview: applies the placeholder through `apply` synchronously and
     * returns `undefined` (Crepe keeps its loading state until the rendered SVG arrives).
     */
    renderPreview(code: string, apply: PreviewApply): undefined;
    /** Theme changed: re-initialize and redraw every live block (no-op before the first render). */
    applyTheme(): void;
}

export interface MermaidPreviewOptions {
    /** Loader seam for tests; production lazy-loads the ~1.3 MB mermaid chunk on first render. */
    loadMermaidModule?: () => Promise<MermaidModule>;
}

export function createMermaidPreview(
    isDark: () => boolean,
    options: MermaidPreviewOptions = {},
): MermaidPreview {
    const codeMap = new Map<string, string>();
    let seq = 0;
    let module: MermaidModule | null = null;
    let initializedFor: boolean | null = null;

    async function loadMermaid(): Promise<MermaidModule> {
        if (!module) {
            const load = options.loadMermaidModule
                ?? (() => import("mermaid").then((mod) => mod.default));
            module = await load();
        }
        if (initializedFor !== isDark()) {
            module.initialize(mermaidInitConfig(isDark()));
            initializedFor = isDark();
        }
        return module;
    }

    async function renderMermaid(code: string): Promise<string> {
        const id = "mermaid-" + Math.random().toString(36).slice(2, 8);
        const mermaid = await loadMermaid();
        const { svg } = await mermaid.render(id, code);
        return svg;
    }

    function enhance(el: HTMLElement, svg: string): void {
        el.innerHTML = svg;
        const svgEl = el.querySelector<SVGElement>("svg");
        if (svgEl) enhanceMermaidPreview(el, svgEl);
    }

    function applyTheme(): void {
        if (!module) return;
        module.initialize(mermaidInitConfig(isDark()));
        initializedFor = isDark();
        codeMap.forEach((code, key) => {
            const el = document.querySelector<HTMLElement>(`[data-mermaid-key="${key}"]`);
            if (el) {
                renderMermaid(code).then((svg) => {
                    enhance(el, svg);
                }).catch(() => { /* one failed diagram must not block the others */ });
            }
        });
    }

    function renderPreview(code: string, apply: PreviewApply): undefined {
        const key = `m-${++seq}`;
        // Reclaim keys whose node is gone; stale keys made every theme switch query the DOM.
        for (const oldKey of codeMap.keys()) {
            if (oldKey !== key && !document.querySelector(`[data-mermaid-key="${oldKey}"]`)) {
                codeMap.delete(oldKey);
            }
        }
        codeMap.set(key, code);
        apply(`<div data-mermaid-key="${key}"></div>`);
        const el = () => document.querySelector<HTMLElement>(`[data-mermaid-key="${key}"]`);
        renderMermaid(code).then((svg) => {
            const e = el();
            if (!e) return;
            enhance(e, svg);
        }).catch((err) => {
            console.warn('[mermaid] render failed:', err);
            const e = el();
            if (e) e.innerHTML = `<span style="color:var(--vscode-errorForeground)">Mermaid: ${err}</span>`;
        });
    }

    return { renderPreview, applyTheme };
}
