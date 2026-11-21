
import { describe, expect, it } from "vitest";
import { pinHeadingHighlight, resolveHighlight } from "../outline/headingHighlight";

describe("resolveHighlight（点击钉住优先，用户再动即解除）", () => {
    it("没有钉住时 应该 跟随滚动几何", () => {
        expect(resolveHighlight(null, 2, 0)).toEqual({ pos: 2, pin: null });
        expect(resolveHighlight(null, null, 0)).toEqual({ pos: null, pin: null });
    });

    it("已钉住且用户没再交互 应该 保持被点项（即使几何值不同）", () => {
        const pin = pinHeadingHighlight(0, 7);

        expect(resolveHighlight(pin, 3, 7)).toEqual({ pos: 0, pin });
    });

    it("钉住后几何值一直不变 也应该 保持被点项（短文档的实际情形）", () => {
        const pin = pinHeadingHighlight(1, 7);

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
