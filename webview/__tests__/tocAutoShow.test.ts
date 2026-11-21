
import { describe, expect, it } from "vitest";
import { resolveTocOpen, shouldAutoShowToc, TOC_AUTO_SHOW_EXTRA_PX } from "../components/toc";

describe("TOC 自动展开阈值", () => {
    it("默认编辑页宽 900 时，窗口 ≥1000 才自动展开", () => {
        expect(TOC_AUTO_SHOW_EXTRA_PX).toBe(100);
        expect(shouldAutoShowToc(999, 900)).toBe(false);
        expect(shouldAutoShowToc(1000, 900)).toBe(true);
    });

    it("阈值跟着用户设置的编辑页宽度走（动态 ±）", () => {
        expect(shouldAutoShowToc(1000, 900)).toBe(true);
        expect(shouldAutoShowToc(1000, 1200)).toBe(false);
        expect(shouldAutoShowToc(1000, 700)).toBe(true);
        expect(shouldAutoShowToc(800, 700)).toBe(true);
    });
});

describe("TOC 打开状态裁决（两态模型）", () => {
    it("用户点过关闭 应该 压过宽度规则：窗口再宽也不打开", () => {
        expect(resolveTocOpen(true, 3000, 900)).toBe(false);
        expect(resolveTocOpen(true, 1000, 900)).toBe(false);
    });

    it("未点过关闭时 应该 由宽度决定", () => {
        expect(resolveTocOpen(false, 1000, 900)).toBe(true);
        expect(resolveTocOpen(false, 999, 900)).toBe(false);
    });

    it("用户点开（解除偏好）后 仍然 会被宽度覆盖——手动打开不压过宽度规则", () => {

        expect(resolveTocOpen(false, 800, 900)).toBe(false);
    });
});
