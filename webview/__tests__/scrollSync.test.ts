
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
    getContentBlockElements,
    scrollToSourceLine,
    stickyBarHeight,
    switchTargetLine,
    visibleSourceLine,
} from "../app/scrollSync";

interface BlockSpec {

    elements: Array<HTMLElement | null>;
}

function fakeView(spec: BlockSpec): EditorView {
    const offsets = spec.elements.map((_, i) => i);
    return {
        state: {
            doc: {
                forEach: (cb: (node: unknown, offset: number) => void) => {
                    for (const offset of offsets) { cb({}, offset); }
                },
            },
        },
        nodeDOM: (offset: number) => spec.elements[offset] ?? null,
    } as unknown as EditorView;
}


function withRect(el: HTMLElement, top: number, height: number): HTMLElement {
    el.getBoundingClientRect = () => ({
        top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: top,
        toJSON: () => ({}),
    }) as DOMRect;
    return el;
}

function block(top: number, height: number): HTMLElement {
    return withRect(document.createElement("div"), top, height);
}


function installTopBar(height = 40): void {
    const bar = document.createElement("div");
    bar.className = "milkdown-top-bar";
    withRect(bar, 0, height);
    document.body.appendChild(bar);
}

describe("scrollSync 几何", () => {
    beforeEach(() => {
        document.body.innerHTML = "";
        vi.restoreAllMocks();
        window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    });

    it("getContentBlockElements 应该 忽略非 HTMLElement 的槽位", () => {
        const a = block(0, 10);
        const view = fakeView({ elements: [a, null, block(10, 10)] });
        expect(getContentBlockElements(view)).toHaveLength(2);
    });

    it("stickyBarHeight 无吸顶条时 应该 为 0，有则取测量高度", () => {
        expect(stickyBarHeight()).toBe(0);

        const sticky = document.createElement("div");
        sticky.className = "heading-sticky-title";
        withRect(sticky, 0, 28);
        document.body.appendChild(sticky);
        expect(stickyBarHeight()).toBe(28);

        sticky.hidden = true;
        expect(stickyBarHeight()).toBe(0);
    });

    it("scrollToSourceLine 应该 在块内按行比例插值（长块落到对应行）", () => {
        installTopBar(40);

        const first = block(0, 50);
        const second = block(100, 90);
        const view = fakeView({ elements: [first, second] });
        vi.spyOn(window, "scrollY", "get").mockReturnValue(0);

        scrollToSourceLine(view, [1, 2], [1, 10], 6);

        const calls = (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls).toHaveLength(1);

        expect(calls[0][0]).toEqual({ top: 145 - 40 - 8 });
    });

    it("scrollToSourceLine 目标行早于第一个块时 应该 回到顶部", () => {
        installTopBar(40);
        const view = fakeView({ elements: [block(0, 10)] });
        scrollToSourceLine(view, [5], [5], 1);
        const calls = (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls[0][0]).toEqual({ top: 0 });
    });

    it("scrollToSourceLine 空行号表 应该 不做任何滚动", () => {
        const view = fakeView({ elements: [block(0, 10)] });
        scrollToSourceLine(view, [], [], 3);
        expect(window.scrollTo).not.toHaveBeenCalled();
    });

    it("visibleSourceLine 应该 返回落在锚点下方那个块的行号", () => {
        installTopBar(40);
        const first = block(-100, 100);
        const second = block(30, 100);
        const view = fakeView({ elements: [first, second] });

        expect(visibleSourceLine(view, [1, 5], [1, 9])).toBeGreaterThanOrEqual(5);
        expect(visibleSourceLine(view, [1, 5], [1, 9])).toBeLessThanOrEqual(9);
    });

    it("visibleSourceLine 空行号表 应该 返回 1", () => {
        const view = fakeView({ elements: [block(0, 10)] });
        expect(visibleSourceLine(view, [], [])).toBe(1);
    });

    it("switchTargetLine 可见行正好是块起始行且导航行同块时 应该 优先用导航行", () => {
        installTopBar(40);

        const view = fakeView({ elements: [block(-100, 100), block(48, 100)] });
        expect(visibleSourceLine(view, [1, 5], [1, 9])).toBe(5);
        expect(switchTargetLine(view, [1, 5], [1, 9], 7)).toBe(7);
    });

    it("已知限制：可见行落在块中间时 导航行被丢弃（判据用的是精确相等）", () => {
        installTopBar(40);
        const view = fakeView({ elements: [block(-100, 100), block(30, 100)] });
        const visible = visibleSourceLine(view, [1, 5], [1, 9]);

        expect(visible).toBe(6);
        expect(switchTargetLine(view, [1, 5], [1, 9], 7)).toBe(6);
    });

    it("switchTargetLine 导航行已不在当前块时 应该 用可见行", () => {
        installTopBar(40);
        const view = fakeView({ elements: [block(-100, 100), block(30, 100)] });

        const visible = visibleSourceLine(view, [1, 5], [1, 9]);
        expect(switchTargetLine(view, [1, 5], [1, 9], 1)).toBe(visible);
    });

    it("switchTargetLine 没有导航行时 应该 直接返回可见行", () => {
        installTopBar(40);
        const view = fakeView({ elements: [block(30, 100)] });
        expect(switchTargetLine(view, [5], [9], null)).toBe(visibleSourceLine(view, [5], [9]));
    });
});
