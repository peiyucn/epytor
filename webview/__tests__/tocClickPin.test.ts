
import { afterEach, describe, expect, it } from "vitest";
import { createEditor, destroyEditor, getEditorView } from "../editor";
import { initToc } from "../components/toc";

if (typeof (window as unknown as Record<string, unknown>).IntersectionObserver === "undefined") {
    (window as unknown as Record<string, unknown>).IntersectionObserver = class {
        observe() {  } unobserve() {  } disconnect() {  } takeRecords() { return []; }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() {  }, removeListener() {  },
        addEventListener() {  }, removeEventListener() {  },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
(window as unknown as Record<string, unknown>).__i18n = {
    translations: {}, isMac: false, serializationMode: "clean",
};
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {  } unobserve() {  } disconnect() {  }
    };
}

const TOPBAR_BOTTOM = 36;
const VIEWPORT_HEIGHT = 800;

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




            document.body.dispatchEvent(new Event("wheel", { bubbles: true }));
            await settleGeometry();

            expect(pinned).toBe(0);
            expect(activeIndex(list)).not.toBe(0);
        } finally {
            restore();
        }
    }, 60000);
});
