/**
 * TOC 开合/拖拽的过渡声明（`components/toc/toc.css`）。
 *
 * 回归（2026-10-26，owner 手测：「toc 边栏在打开的时候，边缘那个拖动条会有延迟，
 * 没有跟上整体」）。三处声明导致「各走各的」：
 *
 * ① `.toc-toggle-tab` 用 `left` + `transition: left`——`left` 是主线程布局属性，
 *    而 panel 的开合走 `transform`（合成线程）。逻辑位置逐帧相同，但渲染管线不同，
 *    视觉上 tab 落后于 panel；
 * ② `body.toc-open { transition: padding-left }` 把过渡挂在开合态类名上——**关闭**时
 *    类名先被摘掉，过渡规则随之消失，正文立刻跳回 0，而 panel 还在 0.2s 滑出；
 * ③ `.milkdown-top-bar` 的过渡写成 `left`，而 JS 改的是 `padding-left`，`left` 恒为 0
 *    → 过渡从未生效，顶栏一步从 85px 跳到 200px（实测 computed 为 all/0s）。
 *
 * 这几条都是「声明层」的错，jsdom 没有布局引擎、量不到视觉落后，但可以直接钉住
 * 「过渡属性必须与 JS 实际改动的那一项一致、且不能被状态类名门控」。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rawCss = readFileSync(
    path.resolve(process.cwd(), "webview/components/toc/toc.css"),
    "utf-8",
);

/** 去掉 CSS 注释（规则匹配必须跳过注释里的花括号/逗号/示例选择器） */
function stripComments(css: string): string {
    return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

const css = stripComments(rawCss);

/** 找出选择器列表**恰好包含**给定选择器的规则；返回完整选择器集合与声明体 */
function findRule(selector: string): { selectors: string[]; body: string } | null {
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = m[1].split(",").map((s) => s.trim().replace(/\s+/g, " "));
        if (selectors.includes(selector)) {
            return { selectors, body: m[2].replace(/\s+/g, " ").trim() };
        }
    }
    return null;
}

/** 取出声明的值（如 transition 的完整值） */
function declared(rule: { body: string }, prop: string): string | null {
    const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(rule.body);
    return m ? m[1].trim() : null;
}

/**
 * transition 里被动画的**属性名**集合（按逗号分组，每组第一段就是属性名）。
 *
 * 不能用 `\bleft\b` 这类词边界判断：`padding-left` 里的 `left` 前面是 `-`（非单词字符），
 * 词边界依旧成立，会把「动画 padding-left」误判成「动画 left」。
 */
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
        // 关键：不能再过渡 left——panel 走 transform，tab 走 left 会掉队
        expect(props).not.toContain("left");
    });

    it("拖动条 应该 有确定的 left: 0 基准位（位置完全交给 transform）", () => {
        const rule = findRule(".toc-toggle-tab");
        expect(rule).not.toBeNull();
        expect(declared(rule!, "left")).toBe("0");
    });

    it("正文 padding 过渡 应该 不被开合态类名门控（否则关闭时不走过渡、直接跳回）", () => {
        // 过渡必须挂在裸 body 上：关闭时 toc-open 类名已被摘掉，规则不能跟着消失
        const bodyRule = findRule("body");
        expect(bodyRule, "缺少 body { transition: padding-left … }").not.toBeNull();
        const t = declared(bodyRule!, "transition");
        expect(t).not.toBeNull();
        expect(transitionProperties(t!)).toContain("padding-left");

        // 反向断言：不允许再靠 body.toc-open 单独承载这条过渡
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
