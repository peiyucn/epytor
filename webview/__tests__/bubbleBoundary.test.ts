/**
 * 编辑气泡的可视边界（回归：气泡被左侧 TOC 面板挡住）。
 *
 * 根因：floating-ui 的边界默认取 `clippingAncestors`（沿 DOM 祖先链找裁剪元素）。
 * TOC 面板是 `position: fixed` 的**浮层**、不是气泡祖先，floating-ui 看不见它；
 * 而正文给 TOC 让位用的是 `body { padding-left }`，那也不属于裁剪区域。
 * 于是气泡被定位到面板底下。修法是显式把「正文真实可视区」作为边界交给 floating-ui。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
    BUBBLE_BOUNDARY_PADDING,
    computeBubbleBoundary,
    usableWidth,
} from "../utils/bubbleBoundary";

describe("编辑气泡的可视边界", () => {
    it("TOC 关闭时 应该 左边界为 0、右边界为视口宽", () => {
        const b = computeBubbleBoundary(1200, 0);

        expect(b.left).toBe(0);
        expect(b.right).toBe(1200);
    });

    it("TOC 打开（面板 200px）时 应该 左边界右移到 200，避开面板", () => {
        const b = computeBubbleBoundary(1200, 200);

        expect(b.left).toBe(200);
        expect(b.right).toBe(1200);
        // 可用宽度扣掉两侧留白
        expect(usableWidth(b)).toBe(1200 - 200 - BUBBLE_BOUNDARY_PADDING * 2);
    });

    it("TOC 面板被拖宽到 500px 时 应该 跟着右移（不写死 200）", () => {
        const b = computeBubbleBoundary(1200, 500);

        expect(b.left).toBe(500);
        expect(usableWidth(b)).toBe(1200 - 500 - BUBBLE_BOUNDARY_PADDING * 2);
    });

    it("padding 超过视口宽（异常输入）时 应该 不产生负宽度边界", () => {
        const b = computeBubbleBoundary(300, 500);

        expect(b.right).toBeGreaterThanOrEqual(b.left);
        expect(usableWidth(b)).toBe(0);
    });

    it("非法 padding（NaN）时 应该 回退到 0", () => {
        const b = computeBubbleBoundary(1200, Number.NaN);

        expect(b.left).toBe(0);
    });
});

describe("气泡接线（latexFeature）", () => {
    const src = readFileSync(
        path.resolve(process.cwd(), "webview/vendor/latexFeature.ts"),
        "utf-8",
    );

    it("应该 把显式边界传给 size 中间件（否则 TOC 浮层不可见）", () => {
        expect(src).toMatch(/boundary:\s*boundaryRect\(\)/);
        expect(src).toContain("computeBubbleBoundary");
    });

    it("boundaryRect 应该 从 body 的 padding-left 取 TOC 占位宽度", () => {
        expect(src).toContain("paddingLeft");
        expect(src).toContain("document.body");
    });

    it("不应该 再残留只用视口留白的旧常量（死代码）", () => {
        expect(src).not.toContain("BUBBLE_VIEWPORT_PADDING");
    });
});
