/**
 * 行内公式编辑气泡的算出来的宽度上限（回归：公式在行首/行尾时编辑框溢出页面）。
 *
 * 分工：
 * - **外观**（气泡 padding、内部编辑区 min/max-width、字号）一律用上游 crepe 值，
 *   不改（owner 判定原来就是对的，见 latex.css 文件头）；
 * - **边界**（气泡可以占多宽、摆在哪）由 JS 算：floating-ui 的 size 中间件按
 *   availableWidth 收窄 max-width，位置由 editor/bubbleBoundary.ts 的 placeBubble
 *   夹进编辑区。
 *
 * 所以这里只锁 JS 侧接线；CSS 外观由 bubbleBoundary.test.ts 的「外观必须与上游一致」
 * 一组断言守着。
 *
 * 为什么保留源码文本断言（F4 例外，已评估）：
 * - `vendor/latexFeature.ts` 是 vendored 上游 feature（文件头有 §上游对照，升级依赖时逐节
 *   diff 上游），不属于本次可重构范围，行为化改造要整份复制上游实现；
 * - 这里锁的是 floating-ui 中间件接线（size/availableWidth/maxWidth、placeBubble 委托），
 *   中间件只在真实布局引擎里执行，jsdom 没有布局，行为断言会退化成「造几何再断言同一函数」，
 *   不能证明接线存在。故按「结构断言 + 具名常量直测」保留，并在此注明理由。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { BUBBLE_MIN_WIDTH } from "../editor/bubbleBoundary";

const latexFeatureSrc = readFileSync(
    path.resolve(process.cwd(), "webview/vendor/latexFeature.ts"),
    "utf-8",
);
const bubbleBoundarySrc = readFileSync(
    path.resolve(process.cwd(), "webview/editor/bubbleBoundary.ts"),
    "utf-8",
);

describe("气泡宽度的 JS 兜底", () => {
    it("应该 给 TooltipProvider 注入 floating-ui 的 size 中间件（溢出时压缩宽度）", () => {
        expect(latexFeatureSrc).toContain("size(");
        expect(latexFeatureSrc).toContain("availableWidth");
        // 必须真的写进 max-width，否则中间件只是个空壳
        expect(latexFeatureSrc).toMatch(/elements\.floating\.style\.maxWidth/);
        expect(latexFeatureSrc).toContain("middleware:");
    });

    it("压缩下限 应该是 editor/bubbleBoundary.ts 里的具名常量", () => {
        // 常量本身直测（行为侧）：必须是正的像素下限，否则 size 中间件会压到不可用
        expect(BUBBLE_MIN_WIDTH).toBeGreaterThan(0);
        // 接线是文本断言（理由见文件头）：latexFeature 从 bubbleBoundary 导入，不再各自定义一份
        expect(bubbleBoundarySrc).toMatch(/export const BUBBLE_MIN_WIDTH\s*=\s*\d+/);
        expect(latexFeatureSrc).toContain("BUBBLE_MIN_WIDTH");
        expect(latexFeatureSrc).not.toMatch(/const BUBBLE_MIN_WIDTH\s*=/);
    });

    it("位置 应该 交给 placeBubble（纯函数），不在 latexFeature 里手写几何", () => {
        expect(latexFeatureSrc).toContain("placeBubble(");
        expect(bubbleBoundarySrc).toMatch(/export function placeBubble/);
    });
});
