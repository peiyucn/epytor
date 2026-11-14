/**
 * 代码块预览回调装配回归（editor.ts 把分发器交给 Crepe code-block）。
 *
 * 组件契约见 editor/codeBlockPreview.ts；这里用真实 createEditor 取回装配后的回调，
 * 锁住「普通语言回 null、不出现预览」这条链路（回归：曾回 undefined，预览永远 Loading）。
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
});
