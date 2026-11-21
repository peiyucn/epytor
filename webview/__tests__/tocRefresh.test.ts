
import { afterEach, describe, expect, it, vi } from "vitest";
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
    translations: {},
    isMac: false,
    serializationMode: "clean",
};
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {  } unobserve() {  } disconnect() {  }
    };
}

const TOPBAR_BOTTOM = 36;
const HEADING_HEIGHT = 40;

let scrollY = 400;
Object.defineProperty(window, "scrollY", { get: () => scrollY, configurable: true });

const MD = [
    "# 第一章",
    "正文一",
    "",
    "## 1.1 小节",
    "正文二",
    "",
    "# 第二章",
    "正文三",
].join("\n");

function setViewport(width: number, height: number): void {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
    Object.defineProperty(document.documentElement, "clientWidth", { value: width, configurable: true });
}

async function mount(): Promise<{ list: HTMLElement; refresh: () => void }> {
    const root = document.createElement("div");
    root.id = "editor";
    document.body.appendChild(root);
    await createEditor(root, MD, () => {});

    let index = 0;
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((el) => {
        const docTop = 60 + index * 300;
        index += 1;
        (el as HTMLElement).getBoundingClientRect = () =>
            ({
                width: 800, height: HEADING_HEIGHT,
                top: docTop - scrollY, bottom: docTop + HEADING_HEIGHT - scrollY,
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
            ({ width: 800, height: 5000, top: 0, bottom: 5000, left: 100, right: 900, x: 100, y: 0, toJSON: () => ({}) }) as DOMRect;
    }

    const toc = initToc(() => getEditorView());
    document.body.appendChild(toc.panel);
    toc.toggle();
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    return { list: document.querySelector<HTMLElement>(".toc-list")!, refresh: toc.refresh };
}

function bodyTextPos(): number {
    const view = getEditorView()!;
    let pos = -1;
    view.state.doc.descendants((node, nodePos) => {
        if (node.isText && node.text?.includes("正文一")) pos = nodePos;
    });
    return pos;
}

async function typeAndRefresh(refresh: () => void, count: number): Promise<void> {
    const view = getEditorView()!;
    for (let i = 0; i < count; i++) {
        view.dispatch(view.state.tr.insertText("字", bodyTextPos()));
        refresh();
        await new Promise((r) => setTimeout(r, 0));
    }
}

afterEach(() => {
    destroyEditor();
    document.body.innerHTML = "";
});

describe("输入正文时 TOC 不重建（回归：目录内容一下一下闪）", () => {
    it("标题结构未变的正文输入 不应该 改动目录列表 DOM", async () => {
        setViewport(1024, 768);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 5000, configurable: true });
        const { list, refresh } = await mount();
        expect(list.querySelectorAll(".toc-item").length).toBeGreaterThan(0);

        let childListMutations = 0;
        const mo = new MutationObserver((records) => {
            for (const rec of records) {
                if (rec.type === "childList") childListMutations++;
            }
        });
        mo.observe(list, { childList: true, subtree: true });

        await typeAndRefresh(refresh, 5);
        await new Promise((r) => setTimeout(r, 20));
        mo.disconnect();

        expect(childListMutations).toBe(0);
    }, 60000);

    it("正文输入导致标题位置平移后 应该 仍把当前章节高亮到正确目录项", async () => {
        setViewport(1024, 768);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 5000, configurable: true });
        const { list, refresh } = await mount();

        await typeAndRefresh(refresh, 5);

        window.dispatchEvent(new Event("scroll"));
        await new Promise((r) => setTimeout(r, 500));
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        const active = Array.from(list.querySelectorAll<HTMLElement>(".toc-item--active"));
        expect(active).toHaveLength(1);
        expect(active[0].textContent).toContain("1.1 小节");
    }, 60000);

    it("标题位置平移后、下一次防抖刷新之前 高亮 不应该 中途消失（回归：高亮灭一下再亮）", async () => {
        setViewport(1024, 768);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 5000, configurable: true });
        const { list } = await mount();

        window.dispatchEvent(new Event("scroll"));
        await new Promise((r) => setTimeout(r, 500));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        expect(list.querySelectorAll(".toc-item--active")).toHaveLength(1);

        const view = getEditorView()!;
        view.dispatch(view.state.tr.insertText("字", bodyTextPos()));
        window.dispatchEvent(new Event("scroll"));
        await new Promise((r) => setTimeout(r, 200));
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        expect(list.querySelectorAll(".toc-item--active")).toHaveLength(1);
    }, 60000);

    it("标题文字真的改了 应该 重建并显示新文字", async () => {
        setViewport(1024, 768);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 5000, configurable: true });
        const { list, refresh } = await mount();

        const view = getEditorView()!;

        view.dispatch(view.state.tr.insertText("改", 1));
        refresh();
        await new Promise((r) => setTimeout(r, 0));

        const texts = Array.from(list.querySelectorAll<HTMLElement>(".toc-item-label")).map((el) => el.textContent);
        expect(texts[0]).toContain("第一章");
        expect(texts.some((t) => t?.includes("改"))).toBe(true);
    }, 60000);

    it("文档没有标题时 应该 画出「No headings」占位（空文档签名也是空串，不得被当成「无变化」）", async () => {
        setViewport(1024, 768);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 5000, configurable: true });

        const root = document.createElement("div");
        root.id = "editor";
        document.body.appendChild(root);
        await createEditor(root, "只有正文，没有标题", () => {});

        const toc = initToc(() => getEditorView());
        document.body.appendChild(toc.panel);
        toc.toggle();
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        expect(document.querySelector(".toc-empty")).not.toBeNull();
        expect(document.querySelectorAll(".toc-item")).toHaveLength(0);
    }, 60000);

    it("点击任一目录项后 高亮 应该 落在被点的那一项（回归：高亮停在前一项、点首项无高亮）", async () => {
        setViewport(1024, 800);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 5000, configurable: true });
        const { list } = await mount();

        const originalScrollTo = window.scrollTo;
        window.scrollTo = ((arg: unknown) => {
            scrollY = Number((arg as { top?: number } | undefined)?.top ?? 0);
            window.dispatchEvent(new Event("scroll"));
        }) as unknown as typeof window.scrollTo;

        try {
            await new Promise((r) => setTimeout(r, 400));

            const labels = () => Array.from(list.querySelectorAll<HTMLElement>(".toc-item-label"));
            const activeIndex = () => Array.from(list.querySelectorAll<HTMLElement>(".toc-item"))
                .findIndex((el) => el.classList.contains("toc-item--active"));

            for (let k = 0; k < labels().length; k++) {
                scrollY = 0;
                window.dispatchEvent(new Event("scroll"));
                await new Promise((r) => setTimeout(r, 60));
                await new Promise((r) => requestAnimationFrame(() => r(null)));

                labels()[k].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
                await new Promise((r) => requestAnimationFrame(() => r(null)));
                await new Promise((r) => setTimeout(r, 80));
                await new Promise((r) => requestAnimationFrame(() => r(null)));

                expect({ clicked: k, active: activeIndex() }).toEqual({ clicked: k, active: k });
            }
        } finally {
            window.scrollTo = originalScrollTo;
        }
    }, 60000);

    it("点击整行（非文字处）也应该跳转（回归：只有文字那一截有反应，行的空白点上去没反应）", async () => {
        setViewport(1024, 800);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 5000, configurable: true });
        const { list } = await mount();

        const scrollTo = vi.fn();
        const originalScrollTo = window.scrollTo;
        window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
        try {
            await new Promise((r) => setTimeout(r, 400));

            const items = Array.from(list.querySelectorAll<HTMLElement>(".toc-item"));

            items[1].dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            await new Promise((r) => requestAnimationFrame(() => r(null)));

            expect(scrollTo).toHaveBeenCalledTimes(1);
            const active = items.findIndex((el) => el.classList.contains("toc-item--active"));
            expect(active).toBe(1);
        } finally {
            window.scrollTo = originalScrollTo;
        }
    }, 60000);

    it("点击折叠箭头 不应该 触发跳转（箭头 stopPropagation，与整行点击互不干扰）", async () => {
        setViewport(1024, 800);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 5000, configurable: true });
        const { list } = await mount();

        const scrollTo = vi.fn();
        const originalScrollTo = window.scrollTo;
        window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
        try {
            await new Promise((r) => setTimeout(r, 400));

            const toggle = list.querySelector<HTMLElement>(".toc-collapse-toggle")!;
            toggle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
            await new Promise((r) => setTimeout(r, 0));
            await new Promise((r) => requestAnimationFrame(() => r(null)));

            expect(scrollTo).not.toHaveBeenCalled();
        } finally {
            window.scrollTo = originalScrollTo;
        }
    }, 60000);
});
