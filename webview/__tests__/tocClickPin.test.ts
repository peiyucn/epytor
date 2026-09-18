/**
 * 点击目录项后的高亮钉住（回归 owner 手测 2026-09-17
 * 「点击 toc 没法精准定位到被点项，**内容少的时候比较明显**，内容多的时候基本没事」）。
 *
 * 为什么单开一个文件：本用例需要「可滚动量偏小」的桩测布局——这时阅读线（尾部逐级下滑，
 * 见 utils/headingSticky.ts 的 effectiveReadingLineY）与「被点项」对不上，纯几何判据会
 * 把高亮推到别的项上。
 *
 * 判别力说明（自查过）：光断言「点完立刻高亮在 k」**不足以**证明钉住生效——点击处理器
 * 本身就会同步 applyActiveHeading(k)。真正要锁的是：点击之后、用户再次交互之前，**几何值
 * 变化带来的发布不得把高亮顶走**。下面「钉住期间几何值变了也不动」一例就是为此设计的
 * （去掉钉住必失败）。
 */
import { afterEach, describe, expect, it } from "vitest";
import { createEditor, destroyEditor, getEditorView } from "../editor";
import { initToc } from "../components/toc";

if (typeof (window as unknown as Record<string, unknown>).IntersectionObserver === "undefined") {
    (window as unknown as Record<string, unknown>).IntersectionObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ } takeRecords() { return []; }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() { /* noop */ }, removeListener() { /* noop */ },
        addEventListener() { /* noop */ }, removeEventListener() { /* noop */ },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
(window as unknown as Record<string, unknown>).__i18n = {
    translations: {}, isMac: false, serializationMode: "clean",
};
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
    };
}

const TOPBAR_BOTTOM = 36;
const VIEWPORT_HEIGHT = 800;
/** 内容 1600 → 最多滚 800；阅读线的尾部区间 = 800-36 = 764，几何会随滚动变化 */
const CONTENT_HEIGHT = 1600;
const DOC_TOPS = [60, 200, 340, 480, 620, 760];
const MD = DOC_TOPS
    .map((_, i) => `# 章节 ${i}\n正文内容\n`)
    .join("\n");

let scrollY = 0;
Object.defineProperty(window, "scrollY", { get: () => scrollY, configurable: true });
Object.defineProperty(document.documentElement, "scrollHeight", { get: () => CONTENT_HEIGHT, configurable: true });

function setViewport(width: number, height: number): void {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
    Object.defineProperty(document.documentElement, "clientWidth", { value: width, configurable: true });
}

async function mount(): Promise<{ list: HTMLElement }> {
    setViewport(1024, VIEWPORT_HEIGHT);
    const root = document.createElement("div");
    root.id = "editor";
    document.body.appendChild(root);
    await createEditor(root, MD, () => {});

    let index = 0;
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((el) => {
        const docTop = DOC_TOPS[index++];
        (el as HTMLElement).getBoundingClientRect = () =>
            ({
                width: 800, height: 40,
                top: docTop - scrollY, bottom: docTop + 40 - scrollY,
                left: 100, right: 900, x: 100, y: docTop - scrollY,
                toJSON: () => ({}),
            }) as DOMRect;
    });
    const topbar = root.querySelector(".milkdown-top-bar") as HTMLElement | null;
    if (topbar) {
        topbar.getBoundingClientRect = () =>
            ({ width: 1024, height: TOPBAR_BOTTOM, top: 0, bottom: TOPBAR_BOTTOM, left: 0, right: 1024, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    }
    const prose = root.querySelector(".ProseMirror") as HTMLElement | null;
    if (prose) {
        prose.getBoundingClientRect = () =>
            ({ width: 800, height: CONTENT_HEIGHT, top: 0, bottom: CONTENT_HEIGHT, left: 100, right: 900, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    }

    const toc = initToc(() => getEditorView());
    document.body.appendChild(toc.panel);
    toc.toggle();
    await new Promise((r) => setTimeout(r, 400));
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 400));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    return { list: document.querySelector<HTMLElement>(".toc-list")! };
}

/** 真实浏览器的滚动行为：越界钳制到 [0, maxScroll] */
function stubClampedScrollTo(): () => void {
    const maxScroll = Math.max(0, CONTENT_HEIGHT - VIEWPORT_HEIGHT);
    const original = window.scrollTo;
    window.scrollTo = ((arg: unknown) => {
        const want = Number((arg as { top?: number } | undefined)?.top ?? 0);
        scrollY = Math.min(maxScroll, Math.max(0, want));
        window.dispatchEvent(new Event("scroll"));
    }) as unknown as typeof window.scrollTo;
    return () => { window.scrollTo = original; };
}

/** 等吸顶插件按当前几何重算并发布（防抖 + rAF） */
async function settleGeometry(): Promise<void> {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 420));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
}

afterEach(() => {
    destroyEditor();
    document.body.innerHTML = "";
    scrollY = 0;
});

const activeIndex = (list: HTMLElement): number =>
    Array.from(list.querySelectorAll<HTMLElement>(".toc-item"))
        .findIndex((el) => el.classList.contains("toc-item--active"));

const labels = (list: HTMLElement): HTMLElement[] =>
    Array.from(list.querySelectorAll<HTMLElement>(".toc-item-label"));

async function clickItem(list: HTMLElement, k: number): Promise<void> {
    labels(list)[k].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 80));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
}

describe("点击目录项后的高亮钉住", () => {
    it("依次点击每一项 高亮 应该 落在被点项", async () => {
        const { list } = await mount();
        const restore = stubClampedScrollTo();
        try {
            for (let k = 0; k < DOC_TOPS.length; k++) {
                scrollY = 0;
                await settleGeometry();
                await clickItem(list, k);
                expect({ clicked: k, active: activeIndex(list) }).toEqual({ clicked: k, active: k });
            }
        } finally {
            restore();
        }
    }, 60000);

    it("钉住期间几何值变了 也不应该 把高亮顶走（去掉钉住必失败）", async () => {
        const { list } = await mount();
        const restore = stubClampedScrollTo();
        try {
            scrollY = 0;
            await settleGeometry();
            await clickItem(list, 0);
            expect(activeIndex(list)).toBe(0);

            // 程序化滚动（smooth 的后续帧 / 布局变化）把视口挪到几何判据指向别的项的位置。
            // 这不是用户交互（纪元不变），因此钉住必须继续生效、高亮留在被点的第 0 项。
            scrollY = 300;
            await settleGeometry();
            expect(activeIndex(list)).toBe(0);
        } finally {
            restore();
        }
    }, 60000);

    it("用户再次交互后 应该 解除钉住、交回滚动跟随", async () => {
        const { list } = await mount();
        const restore = stubClampedScrollTo();
        try {
            scrollY = 0;
            await settleGeometry();
            await clickItem(list, 0);
            expect(activeIndex(list)).toBe(0);

            scrollY = 300;
            await settleGeometry();
            const pinned = activeIndex(list);

            // 用户真的滚了：wheel 递增纪元 → 解除钉住，回到几何判定。
            // 必须派发在元素上并冒泡：userInteraction 的监听挂在 document（capture），
            // 直接派发到 window 的事件传播路径不经过 document → 纪元不动。
            document.body.dispatchEvent(new Event("wheel", { bubbles: true }));
            await settleGeometry();

            expect(pinned).toBe(0);           // 解除前仍是钉住值
            expect(activeIndex(list)).not.toBe(0); // 解除后跟随几何
        } finally {
            restore();
        }
    }, 60000);
});
