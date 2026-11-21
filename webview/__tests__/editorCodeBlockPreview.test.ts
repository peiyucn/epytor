
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, destroyEditor } from "../editor";
import { codeBlockConfig } from "@milkdown/kit/component/code-block";
import type { CodeBlockConfig } from "@milkdown/kit/component/code-block";
import type { Editor } from "@milkdown/kit/core";

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {  } unobserve() {  } disconnect() {  }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() {  }, removeListener() {  },
        addEventListener() {  }, removeEventListener() {  },
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
    return createEditor(root, markdown, () => {  });
}

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
