/**
 * 点击目录项后的高亮钉住（回归 owner 手测 2026-09-17）。
 *
 * 症状：「点击 toc 没法精准定位到被点项，**内容少的时候比较明显**，内容多的时候基本没事」。
 *
 * 根因（探针实测）：高亮由滚动几何判定，而阅读线在文档最后 `视口高 - 顶栏底` 像素内会
 * 逐级下滑。**短文档**可滚动量小于这段尾部区间 → 阅读线从一开始就滑到很下面 → 所有标题
 * 都在线上方 → 永远取最后一项；而且短文档**滚不动**到把后面的标题顶到线上，纯几何在
 * 短文档里**无法表达**「用户点的是第几项」。实测（内容 1000 / 视口 800 / 4 个标题 /
 * 最多滚 200px）：点第 1 项 → 高亮落在第 4 项；长文档（内容 5000）则逐项正确。
 *
 * 解法：点击即**钉住**被点项，用户再次交互解除。
 */
import { describe, expect, it } from "vitest";
import { pinHeadingHighlight, resolveHighlight } from "../utils/headingHighlight";

describe("resolveHighlight（点击钉住优先，用户再动即解除）", () => {
    it("没有钉住时 应该 跟随滚动几何", () => {
        expect(resolveHighlight(null, 2, 0)).toEqual({ pos: 2, pin: null });
        expect(resolveHighlight(null, null, 0)).toEqual({ pos: null, pin: null });
    });

    it("已钉住且用户没再交互 应该 保持被点项（即使几何值不同）", () => {
        const pin = pinHeadingHighlight(0, 7);
        // 几何值（短文档恒为最后一项 3）被忽略，高亮仍是被点的第 0 项
        expect(resolveHighlight(pin, 3, 7)).toEqual({ pos: 0, pin });
    });

    it("钉住后几何值一直不变 也应该 保持被点项（短文档的实际情形）", () => {
        const pin = pinHeadingHighlight(1, 7);
        // 连续多次解析，纪元不动 → 始终钉住
        let current = pin;
        for (let i = 0; i < 5; i++) {
            const r = resolveHighlight(current, 3, 7);
            expect(r.pos).toBe(1);
            current = r.pin!;
        }
    });

    it("用户再次交互（纪元变化） 应该 解除钉住并交回几何值", () => {
        const pin = pinHeadingHighlight(0, 7);
        expect(resolveHighlight(pin, 3, 8)).toEqual({ pos: 3, pin: null });
    });

    it("钉住位置为 0 也应该 生效（不能用 falsy 判定）", () => {
        const pin = pinHeadingHighlight(0, 1);
        expect(resolveHighlight(pin, 3, 1).pos).toBe(0);
    });

    it("pinHeadingHighlight 应该 如实记录 pos 与纪元", () => {
        expect(pinHeadingHighlight(4, 12)).toEqual({ pos: 4, epoch: 12 });
    });
});
