
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rawCss = readFileSync(
    path.resolve(process.cwd(), "webview/components/toc/toc.css"),
    "utf-8",
);

function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const css = stripComments(rawCss);

function findRule(selector: string): { selectors: string[]; body: string } | null {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = m[1].split(",").map((s) => s.trim().replace(/\s+/g, " "));
        if (selectors.includes(selector)) {
            return { selectors, body: m[2].replace(/\s+/g, " ").trim() };
        }
    }
    return null;
}

function declared(rule: { body: string }, prop: string): string | null {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(rule.body);
    return m ? m[1].trim() : null;
}

function transitionProperties(value: string): string[] {
    return value
        .split(",")
        .map((part) => part.trim().split(/\s+/)[0])
        .filter((prop): prop is string => Boolean(prop));
}

describe("TOC 过渡声明", () => {
    it("拖动条 应该 用 transform 过渡（与 panel 同走合成层，不能是 left）", () => {
        const rule = findRule(".toc-toggle-tab");
        expect(rule).not.toBeNull();
        const transition = declared(rule!, "transition");
        expect(transition, "缺少 transition 声明").not.toBeNull();
        const props = transitionProperties(transition!);
        expect(props).toContain("transform");

        expect(props).not.toContain("left");
    });

    it("拖动条 应该 有确定的 left: 0 基准位（位置完全交给 transform）", () => {
        const rule = findRule(".toc-toggle-tab");
        expect(rule).not.toBeNull();
        expect(declared(rule!, "left")).toBe("0");
    });

    it("正文 padding 过渡 应该 不被开合态类名门控（否则关闭时不走过渡、直接跳回）", () => {

        const bodyRule = findRule("body");
        expect(bodyRule, "缺少 body { transition: padding-left … }").not.toBeNull();
        const t = declared(bodyRule!, "transition");
        expect(t).not.toBeNull();
        expect(transitionProperties(t!)).toContain("padding-left");

        const gated = findRule("body.toc-open");
        if (gated) {
            expect(transitionProperties(declared(gated, "transition") ?? ""))
                .not.toContain("padding-left");
        }
    });

    it("顶栏过渡属性 应该 是 JS 实际改的 padding-left（不是 left）", () => {
        const rule = findRule(".milkdown-top-bar");
        expect(rule, "缺少 .milkdown-top-bar 过渡规则").not.toBeNull();
        const t = declared(rule!, "transition");
        expect(t).not.toBeNull();
        const props = transitionProperties(t!);
        expect(props).toContain("padding-left");
        expect(props).not.toContain("left");
    });
});
