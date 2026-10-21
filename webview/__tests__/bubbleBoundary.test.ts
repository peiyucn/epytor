/**
 * 气泡坐标夹紧逻辑（回归：气泡被左侧 TOC 面板挡住）。
 *
 * floating-ui 的 `boundary` 只收静态值，而 TOC 宽度会随拖动/开关变化；更要紧的是
 * TOC 是 `position: fixed` 浮层，不在 clippingAncestors 里，也不在 body padding 的
 * 裁剪范围内——floating-ui 原理上就看不见它。所以用自定义中间件在 pipeline 末尾
 * 直接夹紧最终 x 坐标。
 *
 * jsdom 无布局引擎，所以这里测「夹紧函数本身的数学」，不测真实几何。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const latexSrc = readFileSync(
    path.resolve(process.cwd(), "webview/vendor/latexFeature.ts"),
    "utf-8",
);

/**
 * 复刻 clampIntoContentViewport 的数学（与源码同构）。
 * 左边界 = body 左 padding + 留白；右边界 = 视口宽 - 气泡宽 - 留白。
 */
function clampX(
    x: number,
    bubbleWidth: number,
    viewportRight: number,
    bodyPaddingLeft: number,
    gutter: number,
): number {
    const minX = bodyPaddingLeft + gutter;
    const maxX = viewportRight - bubbleWidth - gutter;
    return Math.max(minX, Math.min(x, Math.max(minX, maxX)));
}

describe("气泡坐标夹紧", () => {
    const GUTTER = 8;

    it("TOC 打开时 应该 把落在面板下的气泡推到面板右侧", () => {
        // 视口 1000，TOC 占 200，气泡宽 200，floating-ui 给的 x = 50（钻到面板下）
        const x = clampX(50, 200, 1000, 200, GUTTER);

        expect(x).toBe(200 + GUTTER);
        // 关键断言：夹紧后不再与 [0, 200] 的面板区域重叠
        expect(x).toBeGreaterThanOrEqual(200);
    });

    it("TOC 关闭时 应该 允许气泡贴贴视口左边", () => {
        const x = clampX(0, 200, 1000, 0, GUTTER);

        expect(x).toBe(GUTTER);
    });

    it("气泡超出视口右边 应该 左移回来", () => {
        // x=900 + 宽 200 = 1100 > 1000，应被拉回到 1000-200-8
        const x = clampX(900, 200, 1000, 0, GUTTER);

        expect(x).toBe(1000 - 200 - GUTTER);
        expect(x + 200).toBeLessThanOrEqual(1000);
    });

    it("两边都放不下（气泡比可视区还宽）时 应该 优先贴左，不钻面板", () => {
        // 视口 400，TOC 占 300，气泡宽 200：maxX < minX
        const x = clampX(50, 200, 400, 300, GUTTER);

        // 贴左边界，宽度交给 size 中间件去收窄
        expect(x).toBe(300 + GUTTER);
    });

    it("正常位置（不碰边界）时 应该 原样返回", () => {
        const x = clampX(450, 200, 1000, 100, GUTTER);

        expect(x).toBe(450);
    });
});

describe("接线（latexFeature）", () => {
    it("应该 注册 clampIntoContentViewport 中间件，并排在 size 之后", () => {
        const m = latexSrc.match(/middleware:\s*\[([\s\S]*?)\],\s*\}\);/);
        expect(m, "找不到 TooltipProvider 的 middleware 数组").not.toBeNull();
        const list = m![1];

        expect(list).toContain("shift(");
        expect(list).toContain("size(");
        expect(list).toContain("clampIntoContentViewport()");
        // 顺序：clamp 必须在 size 之后（要用最终尺寸算右边界）
        expect(list.indexOf("size(")).toBeLessThan(
            list.indexOf("clampIntoContentViewport()"),
        );
    });

    it("clamp 应该 从 body 的 padding-left 读 TOC 实时占位", () => {
        const fn = latexSrc.slice(
            latexSrc.indexOf("function clampIntoContentViewport"),
            latexSrc.indexOf("type LatexTooltipProps"),
        );

        expect(fn).toContain("getComputedStyle(document.body)");
        expect(fn).toContain("paddingLeft");
        // 必须夹紧 x，而不是只返回 data
        expect(fn).toMatch(/return \{ x: clamped \}/);
    });

    it("不应该 残留已被取代的 liveBoundary / boundaryRect", () => {
        expect(latexSrc).not.toContain("function liveBoundary");
        expect(latexSrc).not.toContain("function boundaryRect");
    });
});
