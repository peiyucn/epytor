/**
 * 组件样式就近归属（F12）。
 *
 * 回归方向：这类组件样式原本散在全局 `style.css` 里，改一个面板要跨文件搜，`!important` 也容易
 * 在全局层越攒越多。迁到组件目录后，本用例防止它们被重新塞回全局文件，并确保组件仍然加载
 * 自己的 css（迁了文件但没加载 = 样式静默失效）。
 *
 * 2026-10-30 改造（F4）：原先「组件 source 里含 `import "./x.css"` 字面量」三条断言是对实现
 * 文本做字符串匹配，重构换个 import 写法就假红；现在改为
 * 1) 归属：解析 CSS 规则结构，断言规则在对应 sheet、不在全局（不再全文找字符串）；
 * 2) 加载：jsdom 下 Vite 把 CSS import 处理成空模块，DOM 里观察不到样式表，因此用
 *    `vi.mock` 拦住组件自己的 css 模块，动态 import 组件后检查拦截是否命中——这是模块图
 *    层面的行为断言，与 import 语句的写法无关。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const cssImportHits = vi.hoisted(() => [] as string[]);

vi.mock("../components/frontmatterPanel/frontmatterPanel.css", () => {
    cssImportHits.push("frontmatterPanel");
    return {};
});
vi.mock("../components/topBar/topBar.css", () => {
    cssImportHits.push("topBar");
    return {};
});
vi.mock("../components/codeBlockEnhance/codeBlockEnhance.css", () => {
    cssImportHits.push("codeBlockEnhance");
    return {};
});

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf-8");

interface CssRule {
    selectors: string[];
    body: string;
}

/** 解析出规则的选择器集合与声明体；@media 外层被丢弃，内部规则按顶层解析（够本文件用）。 */
function parseRules(css: string): CssRule[] {
    const rules: CssRule[] = [];
    for (const match of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        rules.push({
            selectors: match[1].split(",").map((selector) => selector.trim().replace(/\s+/g, " ")),
            body: match[2],
        });
    }
    return rules;
}

/** 是否存在任意一条规则的选择器包含给定片段 */
function hasSelectorContaining(rules: CssRule[], fragment: string): boolean {
    return rules.some((rule) => rule.selectors.some((selector) => selector.includes(fragment)));
}

const globalRules = parseRules(read("webview/style.css"));

describe("frontmatter 样式归属", () => {
    const panelRules = parseRules(read("webview/components/frontmatterPanel/frontmatterPanel.css"));

    it("组件 css 应该 含面板与输入框规则", () => {
        expect(hasSelectorContaining(panelRules, ".frontmatter-panel")).toBe(true);
        expect(hasSelectorContaining(panelRules, ".fm-key-input--error")).toBe(true);
        expect(hasSelectorContaining(panelRules, ".fm-add-btn")).toBe(true);
    });

    it("全局 style.css 不应该 再出现 frontmatter 规则", () => {
        expect(hasSelectorContaining(globalRules, ".frontmatter-")).toBe(false);
        expect(hasSelectorContaining(globalRules, ".fm-")).toBe(false);
    });
});

describe("顶栏样式归属", () => {
    const barRules = parseRules(read("webview/components/topBar/topBar.css"));

    it("组件 css 应该 含固定顶栏与品牌标记规则", () => {
        expect(hasSelectorContaining(barRules, ".milkdown .milkdown-top-bar")).toBe(true);
        expect(hasSelectorContaining(barRules, ".epytor-brand")).toBe(true);
    });

    it("全局 style.css 不应该 再承载顶栏布局与品牌规则", () => {
        // 折叠期守卫（html[data-epytor-host-collapsed] .milkdown-top-bar）刻意留在全局，
        // 它不是顶栏样式而是视口几何，所以这里只禁后代表达式。
        expect(hasSelectorContaining(globalRules, ".milkdown .milkdown-top-bar")).toBe(false);
        expect(hasSelectorContaining(globalRules, ".epytor-brand")).toBe(false);
    });
});

describe("代码块与灯箱样式归属", () => {
    const codeRules = parseRules(read("webview/components/codeBlockEnhance/codeBlockEnhance.css"));

    it("组件 css 应该 含代码块宿主、工具条与灯箱规则", () => {
        expect(hasSelectorContaining(codeRules, ".milkdown-code-block .cm-editor")).toBe(true);
        expect(hasSelectorContaining(codeRules, ".epytor-fullscreen-btn")).toBe(true);
        expect(hasSelectorContaining(codeRules, ".epytor-fs-lightbox")).toBe(true);
    });

    it("全局 style.css 不应该 再出现这些选择器", () => {
        expect(hasSelectorContaining(globalRules, ".epytor-fs-")).toBe(false);
        expect(hasSelectorContaining(globalRules, ".milkdown-code-block .cm-editor")).toBe(false);
    });
});

describe("组件 css 加载（模块图行为断言）", () => {
    it("三个组件 应该 在模块图里加载各自的 css", async () => {
        await import("../components/frontmatterPanel");
        await import("../components/topBar/buildTopBar");
        await import("../components/codeBlockEnhance");

        expect(cssImportHits).toEqual(
            expect.arrayContaining(["frontmatterPanel", "topBar", "codeBlockEnhance"]),
        );
    }, 40000);
});
