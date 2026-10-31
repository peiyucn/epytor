import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCompositionGate } from "../editor/compositionGate";

const fire = (type: string): void => {
    document.dispatchEvent(new Event(type));
};

describe("createCompositionGate IME 组合门", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("未在组合中 应该 立即放行", async () => {
        const gate = createCompositionGate(document);

        let passed = false;
        const waiting = gate.whenIdle().then(() => { passed = true; });
        await Promise.resolve();

        expect(passed).toBe(true);
        expect(gate.isComposing()).toBe(false);
        await waiting;
        gate.dispose();
    });

    it("组合中 应该 等到 compositionend 才放行", async () => {
        const gate = createCompositionGate(document);
        fire("compositionstart");

        let passed = false;
        const waiting = gate.whenIdle().then(() => { passed = true; });
        await Promise.resolve();
        expect(gate.isComposing()).toBe(true);
        expect(passed).toBe(false);

        fire("compositionend");
        await waiting;
        expect(passed).toBe(true);
        expect(gate.isComposing()).toBe(false);
        gate.dispose();
    });

    it("多个等待者 应该 在 compositionend 时一起放行（重建排队不互相饿死）", async () => {
        const gate = createCompositionGate(document);
        fire("compositionstart");

        const order: string[] = [];
        const first = gate.whenIdle().then(() => { order.push("first"); });
        const second = gate.whenIdle().then(() => { order.push("second"); });
        await Promise.resolve();
        expect(order).toEqual([]);

        fire("compositionend");
        await Promise.all([first, second]);
        expect(order.sort()).toEqual(["first", "second"]);
        gate.dispose();
    });

    it("收不到 compositionend（组合异常中断） 应该 超时兜底放行，不永久挂起", async () => {
        vi.useFakeTimers();
        const gate = createCompositionGate(document, 1000);
        fire("compositionstart");

        let passed = false;
        const waiting = gate.whenIdle().then(() => { passed = true; });
        await vi.advanceTimersByTimeAsync(999);
        expect(passed).toBe(false);

        await vi.advanceTimersByTimeAsync(1);
        await waiting;
        expect(passed).toBe(true);
        gate.dispose();
    });

    it("dispose 应该 移除监听并立即放行等待者", async () => {
        const gate = createCompositionGate(document);
        fire("compositionstart");
        let passed = false;
        const waiting = gate.whenIdle().then(() => { passed = true; });
        await Promise.resolve();
        expect(passed).toBe(false);

        gate.dispose();
        await waiting;
        expect(passed).toBe(true);
        // 监听已移除：再来 compositionend 不会报错、也不会影响状态
        fire("compositionend");
        expect(gate.isComposing()).toBe(false);
    });
});
