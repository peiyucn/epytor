/**
 * 行内公式编辑气泡的算出来的宽度上限（回归：公式在行首/行尾时编辑框溢出页面）。
 *
 * 分工：
 * - **外观**（气泡 padding、内部编辑区 min/max-width、字号）一律用上游 crepe 值，
 *   不改（owner 判定原来就是对的，见 latex.css 文件头）；
 * - **边界**（气泡可以占多宽、摆在哪）由 JS 算：floating-ui 的 size 中间件按
 *   availableWidth 收窄 max-width，位置由 utils/bubbleBoundary.ts 的 placeBubble
 *   夹进编辑区。
 *
 * 所以这里只锁 JS 侧接线；CSS 外观由 bubbleBoundary.test.ts 的「外观必须与上游一致」
 * 一组断言守着。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const latexFeatureSrc = readFileSync(
    path.resolve(process.cwd(), "webview/vendor/latexFeature.ts"),
    "utf-8",
);
const bubbleBoundarySrc = readFileSync(
    path.resolve(process.cwd(), "webview/utils/bubbleBoundary.ts"),
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

    it("压缩下限 应该是 utils/bubbleBoundary.ts 里的具名常量", () => {
        expect(bubbleBoundarySrc).toMatch(/export const BUBBLE_MIN_WIDTH\s*=\s*\d+/);
        // latexFeature 从这里导入，不再各自定义一份
        expect(latexFeatureSrc).toContain("BUBBLE_MIN_WIDTH");
        expect(latexFeatureSrc).not.toMatch(/const BUBBLE_MIN_WIDTH\s*=/);
    });

    it("位置 应该 交给 placeBubble（纯函数），不在 latexFeature 里手写几何", () => {
        expect(latexFeatureSrc).toContain("placeBubble(");
        expect(bubbleBoundarySrc).toMatch(/export function placeBubble/);
    });
});
