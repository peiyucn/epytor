
import { describe, expect, it, vi } from "vitest";
import { createCodeBlockPreview, type PreviewApply } from "../editor/codeBlockPreview";

function setup(): {
    render: ReturnType<typeof createCodeBlockPreview>;
    renderLatex: ReturnType<typeof vi.fn>;
    renderMermaid: ReturnType<typeof vi.fn>;
} {
    const renderLatex = vi.fn();
    const renderMermaid = vi.fn((): undefined => undefined);
    const render = createCodeBlockPreview({ renderLatex, mermaidPreview: { renderPreview: renderMermaid } });
    return { render, renderLatex, renderMermaid };
}

describe("createCodeBlockPreview", () => {
    it("普通语言 应该 返回 null（无预览）且不委派任何渲染器", () => {
        const { render, renderLatex, renderMermaid } = setup();
        const apply: PreviewApply = () => {  };

        expect(render("js", "const a = 1;", apply)).toBeNull();
        expect(render("Pascal", "begin end", apply)).toBeNull();
        expect(renderLatex).not.toHaveBeenCalled();
        expect(renderMermaid).not.toHaveBeenCalled();
    });

    it("latex 且有内容 应该 交给 KaTeX 渲染并返回 null（内容异步回填）", () => {
        const { render, renderLatex } = setup();
        const apply: PreviewApply = () => {  };

        expect(render("LaTeX", "E = mc^2", apply)).toBeNull();
        expect(renderLatex).toHaveBeenCalledWith("E = mc^2", apply);
    });

    it("latex 但内容为空 应该 不调用 KaTeX（按无预览处理）", () => {
        const { render, renderLatex, renderMermaid } = setup();

        expect(render("latex", "", () => {  })).toBeNull();
        expect(renderLatex).not.toHaveBeenCalled();
        expect(renderMermaid).not.toHaveBeenCalled();
    });

    it("mermaid 应该 委派控制器并原样返回 undefined（异步预览待回填）", () => {
        const { render, renderMermaid } = setup();
        const apply: PreviewApply = () => {  };

        expect(render("mermaid", "graph TD; A-->B", apply)).toBeUndefined();
        expect(renderMermaid).toHaveBeenCalledWith("graph TD; A-->B", apply);
    });
});
