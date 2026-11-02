import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeOverflow, type TopBarMeasuredItem } from "../shell/topBarOverflow";
import { initTopBarOverflow, setTopBarButtonMeta } from "../components/topBarOverflow";
import { IFRAME_DEFAULT_HEIGHT, IFRAME_DEFAULT_WIDTH, TINY_REAL_ATTRIBUTE } from "../scroll/viewportLedger";

/** 改写 jsdom 视口尺寸（只读属性需 defineProperty） */
function setViewport(width: number, height: number): void {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

function makeItems(widths: number[]): TopBarMeasuredItem[] {
    return widths.map((width, index) => ({ key: `item-${index}`, width }));
}

describe("computeOverflow", () => {
    it("容器足够宽时 应该 不收起任何项", () => {
        const items = makeItems([40, 40, 40]);
        const hidden = computeOverflow({ items, containerWidth: 200, moreBtnWidth: 30 });
        expect(hidden.size).toBe(0);
    });

    it("超出时 应该 从右往左收起", () => {
        const items = makeItems([40, 40, 40, 40]);
        const hidden = computeOverflow({ items, containerWidth: 140, moreBtnWidth: 30 });
        expect(hidden).toEqual(new Set(["item-3", "item-2"]));
    });

    it("极端窄容器 应该 全部收起", () => {
        const items = makeItems([40, 40, 40]);
        const hidden = computeOverflow({ items, containerWidth: 20, moreBtnWidth: 30 });
        expect(hidden.size).toBe(3);
    });

    it("固定项 应该 优先保留（跳过收起）", () => {
        const items: TopBarMeasuredItem[] = [
            { key: "heading", width: 60 },
            { key: "b", width: 40 },
            { key: "c", width: 40 },
            { key: "d", width: 40 },
        ];
        // 预算 130-30=100：heading(60)+b(40) 可容纳，d/c 收起
        const hidden = computeOverflow({
            items,
            containerWidth: 130,
            moreBtnWidth: 30,
            pinnedKeys: new Set(["heading"]),
        });
        expect(hidden.has("heading")).toBe(false);
        expect(hidden).toEqual(new Set(["d", "c"]));
    });
});

/**
 * 生命周期回归：dispose() 必须把 init 时注册的 window resize 监听器摘干净。
 *
 * 回归：dispose 里写的是 removeEventListener("resize", schedule)，而注册的是
 * scheduleUnlessCollapsed——不是同一引用，监听器留在 window 上。编辑器每次重建
 * （切源码再切回、revert、窗口重载）都泄漏一个，之后每次窗口缩放都会对已销毁的实例
 * 再跑一次测量（getTopBarEl / DOM 查询 / rAF）。
 */
describe("initTopBarOverflow 生命周期", () => {
    /** 可控 rAF：measure 何时执行由测试决定 */
    let rafQueue: FrameRequestCallback[];
    /** dispose 里 disconnect 次数（RO 是否释放） */
    let observerDisconnects: number;

    class FakeResizeObserver {
        observe(): void { /* noop */ }
        unobserve(): void { /* noop */ }
        disconnect(): void { observerDisconnects++; }
    }

    const flushRaf = (): void => {
        const queue = rafQueue;
        rafQueue = [];
        for (const cb of queue) { cb(0); }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        rafQueue = [];
        observerDisconnects = 0;
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            rafQueue.push(cb);
            return rafQueue.length;
        });
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.documentElement.removeAttribute(TINY_REAL_ATTRIBUTE);
        setViewport(1024, 768);
        document.body.innerHTML = "";
    });

    it("dispose 后窗口缩放 应该 不再测量（监听器已释放）", () => {
        const getTopBarEl = vi.fn(() => null);
        const ctl = initTopBarOverflow({ getTopBarEl, runItem: vi.fn() });
        flushRaf(); // init 末尾的首次测量
        const measured = getTopBarEl.mock.calls.length;
        expect(measured).toBeGreaterThan(0);

        ctl.dispose();
        window.dispatchEvent(new Event("resize"));
        flushRaf();

        // 修复前：注册的是 scheduleUnlessCollapsed、移除的是 schedule → 监听器仍在，
        // 这次 resize 会把已 dispose 的实例再测一次
        expect(getTopBarEl).toHaveBeenCalledTimes(measured);
        expect(observerDisconnects).toBe(1);
    });

    it("真实小窗口（用户在 300×150 下操作过） 应该 照常测量（回归 A6）", () => {
        const getTopBarEl = vi.fn(() => null);
        setViewport(IFRAME_DEFAULT_WIDTH, IFRAME_DEFAULT_HEIGHT);
        // 折叠读数 + 用户输入标记 = 用户真把编辑区缩到了这个尺寸
        document.documentElement.setAttribute(TINY_REAL_ATTRIBUTE, "");

        const ctl = initTopBarOverflow({ getTopBarEl, runItem: vi.fn() });
        flushRaf();
        const measured = getTopBarEl.mock.calls.length;
        expect(measured).toBeGreaterThan(0);

        window.dispatchEvent(new Event("resize"));
        flushRaf();

        // 不测量的话按钮会保持上一次真实宽度的排版，在实际 285px 宽的顶栏里溢出
        expect(getTopBarEl).toHaveBeenCalledTimes(measured + 1);
        ctl.dispose();
    });

    it("宿主折叠读数（没有任何用户输入） 应该 跳过测量（顶栏不闪）", () => {
        const getTopBarEl = vi.fn(() => null);
        setViewport(IFRAME_DEFAULT_WIDTH, IFRAME_DEFAULT_HEIGHT);

        const ctl = initTopBarOverflow({ getTopBarEl, runItem: vi.fn() });
        flushRaf();
        const measured = getTopBarEl.mock.calls.length;
        expect(measured).toBeGreaterThan(0);

        window.dispatchEvent(new Event("resize"));
        flushRaf();

        expect(getTopBarEl).toHaveBeenCalledTimes(measured);
        ctl.dispose();
    });

    it("dispose 移除的 resize 处理器 应该 与注册的是同一引用", () => {
        const addSpy = vi.spyOn(window, "addEventListener");
        const removeSpy = vi.spyOn(window, "removeEventListener");
        const ctl = initTopBarOverflow({ getTopBarEl: () => null, runItem: vi.fn() });

        const added = addSpy.mock.calls.filter((call) => call[0] === "resize").map((call) => call[1]);
        ctl.dispose();
        const removed = removeSpy.mock.calls.filter((call) => call[0] === "resize").map((call) => call[1]);

        expect(added).toHaveLength(1);
        expect(removed).toContain(added[0]);
    });
});

/**
 * 溢出菜单本体：收敛到 `ui/anchoredOverlay` 之后，菜单的展开/执行/关闭链路
 * 从「无测试覆盖」变成必须由行为用例钉住——隐藏按钮的元数据、菜单项回调与
 * Esc 关闭都经由新的浮层外壳。
 */
describe("溢出菜单（anchoredOverlay 接线）", () => {
    let rafQueue: FrameRequestCallback[];

    class FakeResizeObserver {
        observe(): void { /* noop */ }
        unobserve(): void { /* noop */ }
        disconnect(): void { /* noop */ }
    }

    const flushRaf = (): void => {
        const queue = rafQueue;
        rafQueue = [];
        for (const cb of queue) { cb(0); }
    };

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        rafQueue = [];
        vi.stubGlobal("ResizeObserver", FakeResizeObserver);
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            rafQueue.push(cb);
            return rafQueue.length;
        });
        vi.stubGlobal("cancelAnimationFrame", vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        document.documentElement.removeAttribute(TINY_REAL_ATTRIBUTE);
        setViewport(1024, 768);
        document.body.innerHTML = "";
    });

    /** 顶栏只有「撑满」行为：jsdom 容器宽 0 → 非 pinned 项全部进菜单。 */
    function makeTopBar(keys: string[]): HTMLElement {
        const topBar = document.createElement("div");
        topBar.className = "milkdown-top-bar";
        const inner = document.createElement("div");
        inner.className = "top-bar-inner";
        for (const key of keys) {
            const child = document.createElement("div");
            child.className = key === "heading" ? "top-bar-heading-selector" : "top-bar-item";
            inner.appendChild(child);
        }
        topBar.appendChild(inner);
        document.body.appendChild(topBar);
        return topBar;
    }

    function initWithMenu(): { topBar: HTMLElement; runItem: ReturnType<typeof vi.fn>; dispose: () => void } {
        setTopBarButtonMeta([
            { key: "heading", icon: "<svg>h</svg>", onRun: () => undefined },
            { key: "image", icon: "<svg>i</svg>", onRun: () => undefined },
            { key: "settings", icon: "<svg>s</svg>", onRun: () => undefined },
        ]);
        const topBar = makeTopBar(["heading", "image", "settings"]);
        const runItem = vi.fn();
        const ctl = initTopBarOverflow({ getTopBarEl: () => topBar, runItem });
        flushRaf();
        return { topBar, runItem, dispose: () => ctl.dispose() };
    }

    it("容器不足时 应该 隐藏非 pinned 按钮并展开含全部隐藏项的菜单", () => {
        const { topBar, dispose } = initWithMenu();
        const moreBtn = document.querySelector<HTMLButtonElement>(".epytor-topbar-more-btn")!;
        expect(moreBtn.hidden).toBe(false);

        moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const menu = document.querySelector(".epytor-topbar-overflow-menu");
        expect(menu).not.toBeNull();
        const items = Array.from(menu!.querySelectorAll<HTMLElement>(".epytor-topbar-overflow-item"));
        expect(items.map((item) => item.querySelector(".epytor-topbar-overflow-label")!.textContent))
            .toEqual(["Heading", "Insert Image", "Settings"]);
        // 隐藏 class 由测量施加（含 settings：它恒在菜单里）
        const hidden = Array.from(topBar.querySelectorAll(".top-bar-item--overflow-hidden, .top-bar-heading-selector.top-bar-item--overflow-hidden"));
        expect(hidden).toHaveLength(3);
        dispose();
    });

    it("点击菜单项 应该 先关闭菜单再执行原按钮动作", () => {
        const { runItem, dispose } = initWithMenu();
        const moreBtn = document.querySelector<HTMLButtonElement>(".epytor-topbar-more-btn")!;
        moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        const items = Array.from(document.querySelectorAll<HTMLElement>(".epytor-topbar-overflow-item"));
        items[1].dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(runItem).toHaveBeenCalledTimes(1);
        expect(runItem.mock.calls[0][0]).toMatchObject({ key: "image" });
        expect(document.querySelector(".epytor-topbar-overflow-menu")).toBeNull();
        dispose();
    });

    it("菜单打开时按 Esc 应该 关闭（浮室外壳的关闭契约在真实菜单上生效）", () => {
        const { dispose } = initWithMenu();
        const moreBtn = document.querySelector<HTMLButtonElement>(".epytor-topbar-more-btn")!;
        moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(document.querySelector(".epytor-topbar-overflow-menu")).not.toBeNull();

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(document.querySelector(".epytor-topbar-overflow-menu")).toBeNull();
        dispose();
    });

    it("再次点击「⋯」（键盘触发 click，无 mousedown） 应该 关闭菜单", () => {
        const { dispose } = initWithMenu();
        const moreBtn = document.querySelector<HTMLButtonElement>(".epytor-topbar-more-btn")!;
        moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(document.querySelector(".epytor-topbar-overflow-menu")).toBeNull();
        dispose();
    });

    it("dispose 应该 连同打开的菜单一起清掉（重建路径不残留浮层）", () => {
        const { dispose } = initWithMenu();
        const moreBtn = document.querySelector<HTMLButtonElement>(".epytor-topbar-more-btn")!;
        moreBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(document.querySelector(".epytor-topbar-overflow-menu")).not.toBeNull();

        dispose();
        expect(document.querySelector(".epytor-topbar-overflow-menu")).toBeNull();
    });
});
