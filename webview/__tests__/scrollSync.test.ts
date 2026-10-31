/**
 * 源码行 ↔ 视口几何（2026-10-27 从 `webview/index.ts` 抽出，抽出时零覆盖）。
 *
 * 这些函数只依赖「块元素顺序 + 行号表 + 元素矩形」，所以用最小 fake view 直接测：
 * `getContentBlockElements` 只用到 `state.doc.forEach` 与 `nodeDOM`。
 */
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
    /** DOM 元素的数量，非 HTMLElement 的槽位用 null 表示（应被忽略） */
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

/** 给元素一个确定的矩形（jsdom 默认全是 0） */
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

/** 顶栏 40px 高；吸顶标题默认不存在 */
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
        // 块 1 覆盖第 1-1 行、块 2 覆盖第 2-10 行（高 90px，从页面 100 开始）
        const first = block(0, 50);
        const second = block(100, 90);
        const view = fakeView({ elements: [first, second] });
        vi.spyOn(window, "scrollY", "get").mockReturnValue(0);

        scrollToSourceLine(view, [1, 2], [1, 10], 6);

        const calls = (window.scrollTo as unknown as ReturnType<typeof vi.fn>).mock.calls;
        expect(calls).toHaveLength(1);
        // 第 6 行在块内约一半 → 100 + 90 * 0.5 = 145，再减顶栏 40 与 8px 内边距
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
        installTopBar(40);   // 锚点 = 40 + 0 + 8 = 48
        const first = block(-100, 100);   // 已完全滚过（bottom=0 < 48）
        const second = block(30, 100);    // 跨过锚点，行 5-9
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
        // 块 2 的顶边正好落在锚点（40+8=48）→ 插值比例 0 → 可见行 = 块起始行 5
        const view = fakeView({ elements: [block(-100, 100), block(48, 100)] });
        expect(visibleSourceLine(view, [1, 5], [1, 9])).toBe(5);
        expect(switchTargetLine(view, [1, 5], [1, 9], 7)).toBe(7);
    });

    it("已知限制：可见行落在块中间时 导航行被丢弃（判据用的是精确相等）", () => {
        installTopBar(40);
        const view = fakeView({ elements: [block(-100, 100), block(30, 100)] });
        const visible = visibleSourceLine(view, [1, 5], [1, 9]);
        // 插值给出 6，而块起始是 5 → "blockStart === visible" 不成立，导航行 7 被丢弃
        expect(visible).toBe(6);
        expect(switchTargetLine(view, [1, 5], [1, 9], 7)).toBe(6);
    });

    it("switchTargetLine 导航行已不在当前块时 应该 用可见行", () => {
        installTopBar(40);
        const view = fakeView({ elements: [block(-100, 100), block(30, 100)] });
        // 可见行在块 2（起始 5），导航行 1 属于块 1 → 退回可见行
        const visible = visibleSourceLine(view, [1, 5], [1, 9]);
        expect(switchTargetLine(view, [1, 5], [1, 9], 1)).toBe(visible);
    });

    it("switchTargetLine 没有导航行时 应该 直接返回可见行", () => {
        installTopBar(40);
        const view = fakeView({ elements: [block(30, 100)] });
        expect(switchTargetLine(view, [5], [9], null)).toBe(visibleSourceLine(view, [5], [9]));
    });
});
