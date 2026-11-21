
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAnchoredOverlay } from "../ui/anchoredOverlay";

const VIEWPORT_WIDTH = 1000;
const VIEWPORT_HEIGHT = 800;

interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

function stubRect(el: Element, rect: Rect): void {
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
        x: rect.left,
        y: rect.top,
        toJSON: () => ({}),
    } as DOMRect);
}

function makeEl(text = "overlay"): HTMLElement {
    const el = document.createElement("div");
    el.textContent = text;
    return el;
}

function pressEscape(): void {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}

describe("anchoredOverlay 定位", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        Object.defineProperty(window, "innerWidth", { value: VIEWPORT_WIDTH, configurable: true });
        Object.defineProperty(window, "innerHeight", { value: VIEWPORT_HEIGHT, configurable: true });
        Object.defineProperty(document.documentElement, "clientWidth", {
            value: VIEWPORT_WIDTH,
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    it("默认 应该 挂在 body 并贴锚点左下（下方 gap 6px）", () => {
        const anchor = makeEl("anchor");
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 300, top: 100, width: 40, height: 20 });

        const el = makeEl();
        stubRect(el, { left: 0, top: 0, width: 120, height: 80 });
        const overlay = openAnchoredOverlay({ el, anchor });

        expect(el.parentElement).toBe(document.body);
        expect(el.style.left).toBe("300px");
        expect(el.style.top).toBe("126px");
        expect(overlay.isOpen()).toBe(true);
        overlay.dispose();
    });

    it("右对齐 应该 让浮层右边缘贴锚点右边缘", () => {
        const anchor = makeEl();
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 300, top: 100, width: 40, height: 20 });

        const el = makeEl();
        stubRect(el, { left: 0, top: 0, width: 120, height: 80 });
        const overlay = openAnchoredOverlay({ el, anchor, align: "right" });

        expect(el.style.left).toBe("220px");
        overlay.dispose();
    });

    it("贴近视口右边时 应该 把浮层拉回右边界内", () => {
        const anchor = makeEl();
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 950, top: 100, width: 40, height: 20 });

        const el = makeEl();
        stubRect(el, { left: 0, top: 0, width: 120, height: 80 });
        const overlay = openAnchoredOverlay({ el, anchor, viewportMargin: 8 });

        expect(el.style.left).toBe("872px");
        overlay.dispose();
    });

    it("右对齐时 应该 使用独占的右边界 margin（溢出菜单 12px）", () => {
        const anchor = makeEl();
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 950, top: 100, width: 40, height: 20 });

        const el = makeEl();
        stubRect(el, { left: 0, top: 0, width: 120, height: 80 });
        const overlay = openAnchoredOverlay({
            el,
            anchor,
            align: "right",
            viewportMargin: 8,
            viewportRightMargin: 12,
        });

        expect(el.style.left).toBe("868px");
        overlay.dispose();
    });

    it("下方放不下时 应该 翻到锚点上方", () => {
        const anchor = makeEl();
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 300, top: 700, width: 40, height: 20 });

        const el = makeEl();
        stubRect(el, { left: 0, top: 0, width: 120, height: 80 });
        const overlay = openAnchoredOverlay({ el, anchor });

        expect(el.style.top).toBe("614px");
        overlay.dispose();
    });

    it("上下都放不下时 应该 夹在视口顶部 margin 内（不越出）", () => {
        const anchor = makeEl();
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 300, top: 0, width: 40, height: 20 });

        const el = makeEl();
        stubRect(el, { left: 0, top: 0, width: 120, height: 790 });
        const overlay = openAnchoredOverlay({ el, anchor });

        expect(el.style.top).toBe("8px");
        overlay.dispose();
    });

    it("显式 size 应该 覆盖实测尺寸（固定尺寸网格选择器保持旧数字）", () => {
        const anchor = makeEl();
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 300, top: 100, width: 40, height: 20 });

        const el = makeEl();

        stubRect(el, { left: 0, top: 0, width: 500, height: 500 });
        const overlay = openAnchoredOverlay({
            el,
            anchor,
            align: "right",
            size: { width: 120, height: 80 },
        });

        expect(el.style.left).toBe("220px");
        overlay.dispose();
    });

    it("reposition 应该 在锚点移动后重新夹取位置", () => {
        const anchor = makeEl();
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 300, top: 100, width: 40, height: 20 });

        const el = makeEl();
        stubRect(el, { left: 0, top: 0, width: 120, height: 80 });
        const overlay = openAnchoredOverlay({ el, anchor });
        expect(el.style.left).toBe("300px");

        vi.mocked(anchor.getBoundingClientRect).mockReturnValue({
            left: 600, top: 240, width: 40, height: 20, right: 640, bottom: 260, x: 600, y: 240,
            toJSON: () => ({}),
        } as DOMRect);
        overlay.reposition();

        expect(el.style.left).toBe("600px");
        expect(el.style.top).toBe("266px");
        overlay.dispose();
    });
});

describe("anchoredOverlay 关闭契约", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        Object.defineProperty(window, "innerHeight", { value: VIEWPORT_HEIGHT, configurable: true });
        Object.defineProperty(document.documentElement, "clientWidth", {
            value: VIEWPORT_WIDTH,
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    function open(): { el: HTMLElement; overlay: ReturnType<typeof openAnchoredOverlay> } {
        const anchor = makeEl("anchor");
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 300, top: 100, width: 40, height: 20 });
        const el = document.createElement("div");
        const child = document.createElement("button");
        child.textContent = "item";
        el.appendChild(child);
        stubRect(el, { left: 0, top: 0, width: 120, height: 80 });
        return { el, overlay: openAnchoredOverlay({ el, anchor }) };
    }

    it("Esc 应该 关闭并移除浮层", () => {
        const { el, overlay } = open();
        pressEscape();
        expect(overlay.isOpen()).toBe(false);
        expect(document.body.contains(el)).toBe(false);
    });

    it("mousedown 浮层外部 应该 关闭；内部 mousedown 不应该 关闭", () => {
        const { el, overlay } = open();
        el.querySelector("button")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(overlay.isOpen()).toBe(true);

        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(overlay.isOpen()).toBe(false);
    });

    it("滚动 应该 关闭浮层", () => {
        const { overlay } = open();
        window.dispatchEvent(new Event("scroll"));
        expect(overlay.isOpen()).toBe(false);
    });

    it("dispose 幂等 应该 不抛错且监听器全部摘除", () => {
        const { el, overlay } = open();
        overlay.dispose();
        expect(() => overlay.dispose()).not.toThrow();
        expect(document.body.contains(el)).toBe(false);

        expect(() => pressEscape()).not.toThrow();
        expect(() => window.dispatchEvent(new Event("scroll"))).not.toThrow();
    });

    it("closeOn 关闭某个触发条件后 该事件 应该 不关闭浮层", () => {
        const anchor = makeEl();
        document.body.appendChild(anchor);
        stubRect(anchor, { left: 300, top: 100, width: 40, height: 20 });
        const el = document.createElement("div");
        stubRect(el, { left: 0, top: 0, width: 120, height: 80 });
        const overlay = openAnchoredOverlay({
            el,
            anchor,
            closeOn: { escape: false, outsideMousedown: false, scroll: false },
        });

        pressEscape();
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        window.dispatchEvent(new Event("scroll"));
        expect(overlay.isOpen()).toBe(true);

        overlay.dispose();
    });
});
