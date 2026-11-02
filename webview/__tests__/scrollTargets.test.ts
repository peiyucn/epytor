/**
 * 延迟滚动定位（覆盖 app/scrollTargets.ts）。
 * 拆分自 index.ts（audit F1/F10）；用例锁住 PendingScroll 的所有权语义、重试计划
 * 只在布局完成后执行一次、用户交互后放弃重试。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@milkdown/kit/prose/view";
import { createScrollTargets, PendingScroll } from "../app/scrollTargets";

/** 只有一个内容块的视图桩：块高度由 `height.value` 控制（0 = 布局未完成）。 */
function fakeView(height: { value: number }): EditorView {
    const block = document.createElement("div");
    block.getBoundingClientRect = () => ({
        height: height.value,
        top: 0,
        bottom: height.value,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    } as DOMRect);
    const doc = { forEach: (fn: (node: unknown, offset: number) => void) => fn({}, 0) };
    return { state: { doc }, nodeDOM: () => block } as unknown as EditorView;
}

function createTargets(view: EditorView | null) {
    return createScrollTargets({
        getView: () => view,
        getLineMaps: () => ({ lineMap: [1], lineEndMap: [1] }),
        getState: () => null,
    });
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

describe("PendingScroll", () => {
    it("set 之后 line 应该 读到目标行；clearIf 只清除匹配的行", () => {
        const pending = new PendingScroll();
        expect(pending.line).toBeNull();
        pending.set(12);
        pending.clearIf(11);
        expect(pending.line).toBe(12); // 新目标不能被旧滚动清掉
        pending.clearIf(12);
        expect(pending.line).toBeNull();
    });
});

describe("scheduleDelayedScroll", () => {
    it("首块高度为 0（布局未完成） 应该 继续重试，布局完成后只执行一次", () => {
        vi.useFakeTimers();
        const height = { value: 0 };
        const targets = createTargets(fakeView(height));
        const action = vi.fn();

        targets.scheduleDelayedScroll(action, [0, 100]);
        vi.advanceTimersByTime(0);
        expect(action).not.toHaveBeenCalled();

        height.value = 40;
        vi.advanceTimersByTime(100);
        expect(action).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(2000);
        expect(action).toHaveBeenCalledTimes(1); // 成功后不再重复执行
    });

    it("调度后发生用户交互 应该 放弃重试（避免 300-2000ms 后的迟到滚动抢走操作）", () => {
        vi.useFakeTimers();
        const height = { value: 40 };
        const targets = createTargets(fakeView(height));
        const action = vi.fn();

        targets.scheduleDelayedScroll(action, [0, 100]);
        document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        vi.advanceTimersByTime(500);
        expect(action).not.toHaveBeenCalled();
    });

    it("视图尚未创建时 应该 不执行、也不抛错", () => {
        vi.useFakeTimers();
        const targets = createTargets(null);
        const action = vi.fn();
        targets.scheduleDelayedScroll(action, [0]);
        vi.advanceTimersByTime(100);
        expect(action).not.toHaveBeenCalled();
    });
});

describe("applyPendingScrollLine", () => {
    it("布局就绪后 应该 滚动到待定位行并清空 pending", () => {
        vi.useFakeTimers();
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => { /* 断言调用即可 */ });
        const targets = createTargets(fakeView({ value: 40 }));
        targets.pending.set(3);

        targets.applyPendingScrollLine();
        vi.advanceTimersByTime(0);

        expect(scrollTo).toHaveBeenCalled();
        const arg = scrollTo.mock.calls[0][0] as unknown as { top: number };
        expect(Number.isFinite(arg.top)).toBe(true);
        expect(targets.pending.line).toBeNull();
    });

    it("滚动落地前又来了新目标 应该 保留新目标（旧滚动不得清掉它）", () => {
        vi.useFakeTimers();
        vi.spyOn(window, "scrollTo").mockImplementation(() => { /* noop */ });
        const targets = createTargets(fakeView({ value: 40 }));
        targets.pending.set(3);
        targets.applyPendingScrollLine();
        targets.pending.set(9);

        vi.advanceTimersByTime(0);
        expect(targets.pending.line).toBe(9);
    });

    it("没有待定位行时 应该 不做任何滚动", () => {
        vi.useFakeTimers();
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => { /* noop */ });
        const targets = createTargets(fakeView({ value: 40 }));
        targets.applyPendingScrollLine();
        vi.advanceTimersByTime(0);
        expect(scrollTo).not.toHaveBeenCalled();
    });
});

describe("restoreFoldState", () => {
    it("没有保存的折叠状态 应该 直接跳过", () => {
        const targets = createTargets(null);
        expect(() => targets.restoreFoldState()).not.toThrow();
    });

    it("签名存在但视图不存在 应该 安全跳过（不 dispatch）", () => {
        const targets = createScrollTargets({
            getView: () => null,
            getLineMaps: () => ({ lineMap: [], lineEndMap: [] }),
            getState: () => ({ foldState: { sig: "abc", folded: [1, 2] } }),
        });
        expect(() => targets.restoreFoldState()).not.toThrow();
    });

    it("folded 为空数组 应该 视为无状态（不 dispatch）", () => {
        const targets = createScrollTargets({
            getView: () => null,
            getLineMaps: () => ({ lineMap: [], lineEndMap: [] }),
            getState: () => ({ foldState: { sig: "abc", folded: [] } }),
        });
        expect(() => targets.restoreFoldState()).not.toThrow();
    });
});
