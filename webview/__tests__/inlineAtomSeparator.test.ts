/**
 * 行内原子节点分隔符回归（prosemirror-view 1.42.6 引入）。
 *
 * 1.42.6 在 Safari/Firefox 上为「位于块首 / 紧跟另一个原子节点」的**行内原子节点**
 * 前置一个 dummy `<img class="ProseMirror-separator" alt="">`，用于修掉光标跳位。
 * epytor 的行内公式（`math_inline`，`atom: true`）正是这种节点，因此升级后
 * 文档里会真的多出这个不可见 IMG。
 *
 * 本测试锁住两件事：
 * 1. 分隔符**只**出现在上游约定的两个位置（块首 / 紧跟原子节点），段落中间不插；
 * 2. 它不会撑开间距——`prosemirror-view` 自带的
 *    `img.ProseMirror-separator { display:inline !important; margin:0 !important }`
 *    防护规则必须进到产物 CSS 里，否则会被 epytor 的通用 img 规则（圆角、最大宽度）影响。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditor, destroyEditor } from "../editor";
import type { Editor } from "@milkdown/kit/core";

if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() { /* noop */ }, removeListener() { /* noop */ },
        addEventListener() { /* noop */ }, removeEventListener() { /* noop */ },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
if (typeof (window as unknown as Record<string, unknown>).IntersectionObserver === "undefined") {
    (window as unknown as Record<string, unknown>).IntersectionObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } takeRecords() { return []; }
    };
}
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
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

        // 上游在「块首」与「紧跟原子节点」两种位置都插：这里公式既是块首、后面又直接
        // 跟上 trailingBreak，因此前后各出现一个——0 个说明修复没生效，多余个数说明上游又改了策略
        const separators = root.querySelectorAll(SEPARATOR_SELECTOR);
        expect(separators.length).toBeGreaterThanOrEqual(1);
        // 第一个分隔符必须在公式之前，且公式本身仍是 math_inline
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

        // 表头是 th，正文行才是 td
        const cell = root.querySelector("td")!;
        const paragraph = cell.firstElementChild!;
        // epytor 的贴边规则 `.ProseMirror td > *:first-child { margin-top: 0 }` 选中的是 <p>，
        // 分隔符在 <p> 里面，因此不会抢走 :first-child
        expect(paragraph.tagName).toBe("P");
        expect(paragraph.firstElementChild!.matches(SEPARATOR_SELECTOR)).toBe(true);
        // 分隔符自身带 !important 的 margin:0 / display:inline 防护（产物 CSS 里已核）
        expect(cell.querySelectorAll(SEPARATOR_SELECTOR)).toHaveLength(1);
    }, 20000);

    it("分隔符不应该被当成图片参与序列化（保存往返不引入多余内容）", async () => {
        const { editor } = await makeEditor("$x$\n");
        const { getMarkdown } = await import("@milkdown/kit/utils");
        const markdown = editor.action(getMarkdown());

        expect(markdown.trim()).toBe("$x$");
    }, 20000);

    it("分隔符防护 CSS 应该 带 !important 的 display:inline 与 margin:0（防止被通用 img 规则撑开间距）", () => {
        // prosemirror-view 不是直接依赖（无顶层软链），按包名解析到实际安装位置
        const realCssPath = require.resolve("prosemirror-view/style/prosemirror.css");
        const realCss = readFileSync(realCssPath, "utf-8");
        const rule = /img\.ProseMirror-separator\s*\{([^}]*)\}/.exec(realCss);

        expect(rule, "prosemirror-view 未提供分隔符防护规则，升级后需自行补 CSS").not.toBeNull();
        expect(rule![1]).toMatch(/display:\s*inline\s*!important/);
        expect(rule![1]).toMatch(/margin:\s*0\s*!important/);
    });
});
