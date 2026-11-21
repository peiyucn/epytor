
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
