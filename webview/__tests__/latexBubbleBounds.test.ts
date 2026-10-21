/**
 * 行内公式编辑气泡的宽度约束（回归：公式在行首/行尾时编辑框溢出页面宽度）。
 *
 * 气泡 = `.milkdown-latex-inline-edit`，`position: fixed`，由 floating-ui 定位
 * （定位算法见 utils/bubbleBoundary.ts 的 placeBubble）。
 *
 * 宽度这条线：floating-ui 的 size 中间件按 availableWidth 收窄 max-width，
 * 配合 CSS 让内部编辑区能跟着收（上游的 min-width:174px 会在窄容器里撑破父级）。
 * 位置那条线见 bubbleBoundary.test.ts。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const latexFeatureSrc = readFileSync(
    path.resolve(process.cwd(), "webview/vendor/latexFeature.ts"),
    "utf-8",
);
const latexCss = readFileSync(
    path.resolve(process.cwd(), "webview/latex.css"),
    "utf-8",
);
const bubbleBoundarySrc = readFileSync(
    path.resolve(process.cwd(), "webview/utils/bubbleBoundary.ts"),
    "utf-8",
);

/** 取 CSS 中某个选择器的规则体 */
function ruleBody(css: string, selector: string): string {
    const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const m = new RegExp(esc + "\\s*\\{([^}]*)\\}").exec(css);
    expect(m, `找不到规则 ${selector}`).not.toBeNull();
    return m![1];
}

describe("行内公式编辑气泡的宽度约束", () => {
    it("应该 给 TooltipProvider 注入 floating-ui 的 size 中间件（溢出时压缩宽度）", () => {
        expect(latexFeatureSrc).toContain("size(");
        expect(latexFeatureSrc).toContain("availableWidth");
        // 必须真的写进 max-width，否则中间件只是个空壳
        expect(latexFeatureSrc).toMatch(/elements\.floating\.style\.maxWidth/);
        expect(latexFeatureSrc).toContain("middleware:");
    });

    it("气泡自身 应该有 max-width 上限，不超出视口", () => {
        const body = ruleBody(latexCss, ".milkdown-latex-inline-edit");
        expect(body).toMatch(/max-width:\s*calc\(var\(--epytor-vw/);
        // border-box：max-width 要含自身 padding，否则仍会超出
        expect(body).toMatch(/box-sizing:\s*border-box/);
    });

    it("内部编辑区 应该 能收窄（min-width 不得撑破父级）", () => {
        const body = ruleBody(latexCss, ".milkdown-latex-inline-edit .ProseMirror");
        // 上游原值 min-width:174px 会在窄容器里撑破父级——必须放开
        expect(body).not.toMatch(/min-width:\s*174px/);
        expect(body).toMatch(/min-width:\s*0/);
        // 上限仍保留上游的 294px
        expect(body).toMatch(/max-width:\s*294px/);
    });

    it("压缩下限 应该是 utils/bubbleBoundary.ts 里的具名常量", () => {
        expect(bubbleBoundarySrc).toMatch(/export const BUBBLE_MIN_WIDTH\s*=\s*\d+/);
        // latexFeature 从这里导入，不再各自定义一份
        expect(latexFeatureSrc).toContain("BUBBLE_MIN_WIDTH");
        expect(latexFeatureSrc).not.toMatch(/const BUBBLE_MIN_WIDTH\s*=/);
    });
});
