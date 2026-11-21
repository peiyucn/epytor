
import type { MermaidPreview, PreviewApply } from "./mermaidPreview";

export type { PreviewApply };

type CodeBlockPreviewResult = null | string | HTMLElement | undefined;

export type CodeBlockPreviewRenderer = (lang: string, code: string, apply: PreviewApply) => CodeBlockPreviewResult;

export interface CodeBlockPreviewDeps {

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

        return deps.mermaidPreview.renderPreview(code, apply);
    };
}
