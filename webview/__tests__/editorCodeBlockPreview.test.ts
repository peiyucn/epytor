/**
 * 代码块预览回调契约（editor.ts 装配）回归。
 *
 * Crepe code-block 组件把 renderPreview 的返回值当契约：返回 `null` = 这个块没有预览，
 * 返回 `undefined` = 异步预览待回填（先显示 previewLoading「Loading...」）。
 * v1.3.0 重构把 mermaid 预览抽成 editor/mermaidPreview.ts 后，非 mermaid/latex 语言
 * 落到了 `undefined`：每个普通代码块都冒出预览按钮，点开永远停在 Loading。
 * 这里用真实 createEditor 取回装配后的回调，锁住「普通语言必须回 null」。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, destroyEditor } from "../editor";
import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import type { CodeBlockConfig } from "@milkdown/kit/component/code-block";
import type { Editor } from "@milkdown/kit/core";

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() { /* noop */ }, removeListener() { /* noop */ },
        addEventListener() { /* noop */ }, removeEventListener() { /* noop */ },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
(window as unknown as Record<string, unknown>).__i18n = {
    translations: {},
    isMac: false,
    serializationMode: "clean",
};

afterEach(() => {
    destroyEditor();
    document.body.innerHTML = "";
});

async function openEditor(markdown: string): Promise<Editor> {
    const root = document.createElement("div");
    document.body.appendChild(root);
    return createEditor(root, markdown, () => { /* noop */ });
}

/** 装配后的代码块预览回调（editor.ts 传给 codeMirror feature 的那一个）。 */
function codeBlockPreview(editor: Editor): CodeBlockConfig["renderPreview"] {
    let config: CodeBlockConfig | null = null;
    editor.action((ctx) => {
        config = ctx.get(codeBlockConfig.key);
    });
    if (!config) {
        throw new Error("codeBlockConfig missing");
    }
    return (config as CodeBlockConfig).renderPreview;
}

describe("代码块预览回调", () => {
    it("普通语言代码块 应该 返回 null（无预览），回归：曾返回 undefined 停在 Loading", async () => {
        const editor = await openEditor("# t\n\n```js\nconst a = 1;\n```\n");
        const applyPreview = vi.fn();

        expect(codeBlockPreview(editor)("js", "const a = 1;", applyPreview)).toBeNull();
        expect(applyPreview).not.toHaveBeenCalled();
    });

    it("语言别名（大小写不同）也 应该 返回 null", async () => {
        const editor = await openEditor("# t\n\n```python\nprint(1)\n```\n");
        const applyPreview = vi.fn();

        expect(codeBlockPreview(editor)("Python", "print(1)", applyPreview)).toBeNull();
        expect(applyPreview).not.toHaveBeenCalled();
    });
});
