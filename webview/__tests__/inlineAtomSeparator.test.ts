
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, destroyEditor } from "../editor";
import type { Editor } from "@milkdown/kit/core";

if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() {  }, removeListener() {  },
        addEventListener() {  }, removeEventListener() {  },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
if (typeof (window as unknown as Record<string, unknown>).IntersectionObserver === "undefined") {
    (window as unknown as Record<string, unknown>).IntersectionObserver = class {
        observe() {  } unobserve() {  } disconnect() {  } takeRecords() { return []; }
    };
}
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {  } unobserve() {  } disconnect() {  }
    };
}
(window as unknown as Record<string, unknown>).__i18n = {
    translations: {},
    isMac: false,
    serializationMode: "clean",
};

const SEPARATOR_SELECTOR = "img.ProseMirror-separator";

async function makeEditor(md: string): Promise<{ editor: Editor; root: HTMLElement }> {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const editor = await createEditor(root, md, () => {});
    return { editor, root };
}

afterEach(() => {
    destroyEditor();
    document.body.innerHTML = "";
    document.head.querySelectorAll("link[data-epytor-katex]").forEach((el) => el.remove());
    vi.clearAllMocks();
});

describe("行内原子节点分隔符（prosemirror-view 1.42.6）", () => {
    it("块首的行内公式 应该 被分隔符包住（公式前一个；行尾 trailingBreak 前还有一个）", async () => {
        const { root } = await makeEditor("$x$\n");

        const separators = root.querySelectorAll(SEPARATOR_SELECTOR);
        expect(separators.length).toBeGreaterThanOrEqual(1);

        const paragraph = root.querySelector<HTMLElement>("p")!;
        const children = Array.from(paragraph.children);
        expect(children[0].matches(SEPARATOR_SELECTOR)).toBe(true);
        expect(children[1].getAttribute("data-type")).toBe("math_inline");
    }, 20000);

    it("段落中间的行内公式 应该 不插分隔符（对照：只有块首/紧跟原子节点才插）", async () => {
        const { root } = await makeEditor("前文 $x$ 后文\n");

        expect(root.querySelectorAll(SEPARATOR_SELECTOR)).toHaveLength(0);
    }, 20000);

    it("表格单元格以行内公式开头 应该 分隔符落在 <p> 内部（不破坏 td 的 :first-child 贴边规则）", async () => {
        const { root } = await makeEditor("| 列A | 列B |\n| --- | --- |\n| $x$ 说明 | 普通 |\n");

        const cell = root.querySelector("td")!;
        const paragraph = cell.firstElementChild!;

        expect(paragraph.tagName).toBe("P");
        expect(paragraph.firstElementChild!.matches(SEPARATOR_SELECTOR)).toBe(true);

        expect(cell.querySelectorAll(SEPARATOR_SELECTOR)).toHaveLength(1);
    }, 20000);

    it("分隔符不应该被当成图片参与序列化（保存往返不引入多余内容）", async () => {
        const { editor } = await makeEditor("$x$\n");
        const { getMarkdown } = await import("@milkdown/kit/utils");
        const markdown = editor.action(getMarkdown());

        expect(markdown.trim()).toBe("$x$");
    }, 20000);

    it("分隔符防护 CSS 应该 带 !important 的 display:inline 与 margin:0（防止被通用 img 规则撑开间距）", () => {

        const realCssPath = require.resolve("prosemirror-view/style/prosemirror.css");
        const realCss = readFileSync(realCssPath, "utf-8");
        const rule = /img\.ProseMirror-separator\s*\{([^}]*)\}/.exec(realCss);

        expect(rule, "prosemirror-view 未提供分隔符防护规则，升级后需自行补 CSS").not.toBeNull();
        expect(rule![1]).toMatch(/display:\s*inline\s*!important/);
        expect(rule![1]).toMatch(/margin:\s*0\s*!important/);
    });
});
