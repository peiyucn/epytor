/**
 * Code-block preview dispatcher for Crepe's code-mirror feature.
 *
 * The component callback has three states: a synchronous value renders immediately, `null`
 * means "this block has no preview", and `undefined` means "async preview pending" — the
 * loading placeholder stays until `apply` is called. Answering `undefined` for a language we
 * never render leaves every plain code block on "Loading...", so unhandled languages must
 * answer `null` explicitly.
 *
 * The renderers stay in their own modules (Mermaid controller, vendored KaTeX feature); this
 * dispatcher owns the language routing so the editor facade only assembles dependencies.
 */
import type { MermaidPreview, PreviewApply } from "./mermaidPreview";

export type { PreviewApply };

/** Sync render value, or `undefined` for "async preview pending". */
type CodeBlockPreviewResult = null | string | HTMLElement | undefined;

export type CodeBlockPreviewRenderer = (lang: string, code: string, apply: PreviewApply) => CodeBlockPreviewResult;

export interface CodeBlockPreviewDeps {
    /** Lazy KaTeX block renderer (vendor/latexFeature); applies the HTML once katex is ready. */
    renderLatex: (code: string, apply: PreviewApply) => void;
    mermaidPreview: Pick<MermaidPreview, "renderPreview">;
}

export function createCodeBlockPreview(deps: CodeBlockPreviewDeps): CodeBlockPreviewRenderer {
    return (lang, code, apply) => {
        const language = lang.toLowerCase();
        if (language === "latex" && code.length > 0) {
            deps.renderLatex(code, apply);
            return null;
        }
        if (language !== "mermaid") {
            return null;
        }
        // Mermaid answers `undefined`: its placeholder is applied synchronously, the SVG follows.
        return deps.mermaidPreview.renderPreview(code, apply);
    };
}
