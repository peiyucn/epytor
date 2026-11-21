
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

        expect(latexFeatureSrc).toMatch(/elements\.floating\.style\.maxWidth/);
        expect(latexFeatureSrc).toContain("middleware:");
    });

    it("压缩下限 应该是 editor/bubbleBoundary.ts 里的具名常量", () => {

        expect(BUBBLE_MIN_WIDTH).toBeGreaterThan(0);

        expect(bubbleBoundarySrc).toMatch(/export const BUBBLE_MIN_WIDTH\s*=\s*\d+/);
        expect(latexFeatureSrc).toContain("BUBBLE_MIN_WIDTH");
        expect(latexFeatureSrc).not.toMatch(/const BUBBLE_MIN_WIDTH\s*=/);
    });

    it("位置 应该 交给 placeBubble（纯函数），不在 latexFeature 里手写几何", () => {
        expect(latexFeatureSrc).toContain("placeBubble(");
        expect(bubbleBoundarySrc).toMatch(/export function placeBubble/);
    });
});
