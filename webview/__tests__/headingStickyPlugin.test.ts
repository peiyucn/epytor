
import { describe, expect, it, vi } from "vitest";
import { createEditor, destroyEditor, getEditorView } from "../editor";
import {
    getActiveHeadingPos,
    onActiveHeadingChange,
} from "../editor/plugins/headingStickyPlugin";
import { buildHeadingIndex } from "../outline/headingFold";

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

let scrollY = 150;
Object.defineProperty(window, "scrollY", { get: () => scrollY, configurable: true });


function setViewport(width: number, height: number): void {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

class FakeResizeObserver {

    static instances: FakeResizeObserver[] = [];
    private cb: ResizeObserverCallback;
    private pending = new Set<ReturnType<typeof setTimeout>>();
    targets: Element[] = [];
    constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
        FakeResizeObserver.instances.push(this);
    }
    observe(target: Element): void {
        this.targets.push(target);

        const timer = setTimeout(() => {
            this.pending.delete(timer);
            this.cb([{ target } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
        }, 0);
        this.pending.add(timer);
    }
    unobserve(): void {  }
    disconnect(): void {
        this.targets = [];

        for (const timer of this.pending) clearTimeout(timer);
        this.pending.clear();
    }
    fire(target: Element): void {
        this.cb([{ target } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
}
(window as unknown as Record<string, unknown>).ResizeObserver = FakeResizeObserver;


function fireResize(target: Element): void {
    for (const instance of FakeResizeObserver.instances) {
        if (instance.targets.includes(target)) {
            instance.fire(target);
        }
    }
}

const HEADING_HEIGHT = 40;
const TOPBAR_BOTTOM = 36;


let headingLeft = 100;
let headingWidth = 800;


async function mountWithStubLayout(
    lines: string[],
    docTopOf: (index: number) => number,
): Promise<HTMLElement> {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const editor = await createEditor(root, lines.join("\n"), () => {});
    void editor;

    let index = 0;
    root.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((el) => {
        const docTop = docTopOf(index++);
        (el as HTMLElement).getBoundingClientRect = () =>
            ({
                width: headingWidth,
                height: HEADING_HEIGHT,
                top: docTop - scrollY,
                bottom: docTop + HEADING_HEIGHT - scrollY,
                left: headingLeft,
                right: headingLeft + headingWidth,
                x: headingLeft,
                y: docTop - scrollY,
                toJSON: () => ({}),
            }) as DOMRect;
    });
    const topbar = root.querySelector(".milkdown-top-bar") as HTMLElement | null;
    if (topbar) {
        topbar.getBoundingClientRect = () =>
            ({ width: 800, height: TOPBAR_BOTTOM, top: 0, bottom: TOPBAR_BOTTOM, left: 0, right: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    }

    const prose = root.querySelector(".ProseMirror") as HTMLElement | null;
    if (prose) {
        prose.getBoundingClientRect = () =>
            ({ width: 800, height: 5000, top: 0, bottom: 5000, left: 0, right: 800, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    }
    return root;
}


async function settle(): Promise<void> {
    window.dispatchEvent(new Event("scroll"));
    await new Promise((r) => setTimeout(r, 500));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
}

const stickyEl = () => document.querySelector<HTMLElement>(".heading-sticky-title");

describe("标题吸顶完整链路", () => {
    it("标题顶边碰到吸顶行 应该 立即吸顶该标题（旧实现要等整体滚出，晚一个标题高度）", async () => {

        scrollY = 150;
        const root = await mountWithStubLayout(
            Array.from({ length: 10 }, (_, i) => `## 标题 ${i}\n正文一行\n正文两行`).flatMap((s) => s.split("\n")),
            (i) => 60 + i * 120,
        );
        await settle();

        const sticky = stickyEl();
        expect(sticky).not.toBeNull();
        expect(sticky!.hidden).toBe(false);
        expect(sticky!.textContent).toContain("标题 1");

        destroyEditor();
        root.remove();
    }, 60000);

    it("下一个标题尚未碰到吸顶行 应该 保持上一个标题", async () => {

        scrollY = 100;
        const root = await mountWithStubLayout(
            Array.from({ length: 10 }, (_, i) => `## 标题 ${i}\n正文一行\n正文两行`).flatMap((s) => s.split("\n")),
            (i) => 60 + i * 120,
        );
        await settle();

        const sticky = stickyEl();
        expect(sticky!.hidden).toBe(false);
        expect(sticky!.textContent).toContain("标题 0");
        expect(sticky!.textContent).not.toContain("标题 1");

        destroyEditor();
        root.remove();
    }, 60000);

    it("点击第一级吸顶行 应该 跳回文档第一个标题（回归：pos=0 被 pos>0 挡掉，点了没反应）", async () => {

        scrollY = 100;
        const root = await mountWithStubLayout(
            Array.from({ length: 10 }, (_, i) => `## 标题 ${i}\n正文一行\n正文两行`).flatMap((s) => s.split("\n")),
            (i) => 60 + i * 120,
        );
        await settle();

        const rows = Array.from(stickyEl()!.querySelectorAll<HTMLElement>(".heading-sticky-row"));
        expect(rows).toHaveLength(1);
        expect(rows[0].dataset["headingPos"]).toBe("0");

        const scrollTo = vi.fn();
        const original = window.scrollTo;
        window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
        try {
            rows[0].dispatchEvent(new MouseEvent("click", { bubbles: true }));
            await new Promise((r) => requestAnimationFrame(() => r(null)));
            expect(scrollTo).toHaveBeenCalledTimes(1);
            const arg = scrollTo.mock.calls[0][0] as { top: number };
            expect(Number.isFinite(arg.top)).toBe(true);
        } finally {
            window.scrollTo = original;
        }

        destroyEditor();
        root.remove();
    }, 60000);

    it("多级标题 应该 逐级显示（源码形式行：外层在上、内层在下）", async () => {

        scrollY = 150;
        const root = await mountWithStubLayout(
            ["# 一级", "正文", "### 三级", "正文"],
            (i) => (i === 0 ? 60 : 190),
        );
        await settle();

        const sticky = stickyEl();
        expect(sticky!.hidden).toBe(false);
        const rows = Array.from(sticky!.querySelectorAll<HTMLElement>(".heading-sticky-row"));
        expect(rows).toHaveLength(2);
        expect(rows[0].textContent).toContain("一级");
        expect(rows[1].textContent).toContain("三级");
        expect(rows[0].querySelector(".heading-sticky-marker")?.textContent).toBe("#");
        expect(rows[1].querySelector(".heading-sticky-marker")?.textContent).toBe("###");

        destroyEditor();
        root.remove();
    }, 60000);

    it("目录开合改变正文可用宽度 应该 立即重算吸顶条几何（回归：要滑动一下才自适应宽度）", async () => {
        scrollY = 150;
        headingLeft = 100;
        headingWidth = 800;
        const root = await mountWithStubLayout(
            Array.from({ length: 10 }, (_, i) => `## 标题 ${i}\n正文一行\n正文两行`).flatMap((s) => s.split("\n")),
            (i) => 60 + i * 120,
        );
        await settle();

        const sticky = stickyEl();
        expect(sticky!.hidden).toBe(false);
        expect(sticky!.style.left).toBe("100px");
        expect(sticky!.style.width).toBe("800px");




        headingLeft = 200;
        headingWidth = 600;
        fireResize(document.body);
        await new Promise((r) => requestAnimationFrame(() => r(null)));

        expect(sticky!.style.left).toBe("200px");
        expect(sticky!.style.width).toBe("600px");

        headingLeft = 100;
        headingWidth = 800;
        destroyEditor();
        root.remove();
    }, 60000);

    it("宿主折叠恢复 应该 复用缓存、不在切回帧做全量重建（回归：小画面偶发可见的长尾）", async () => {
        scrollY = 150;
        headingLeft = 100;
        headingWidth = 800;


        const originalBodyRect = document.body.getBoundingClientRect.bind(document.body);
        let bodyWidth = 800;
        const bodySpy = vi.spyOn(document.body, "getBoundingClientRect").mockImplementation(
            () => ({ ...originalBodyRect(), width: bodyWidth }) as DOMRect,
        );

        const root = await mountWithStubLayout(
            Array.from({ length: 8 }, (_, i) => `## 标题 ${i}\n正文一行`).flatMap((s) => s.split("\n")),
            (i) => 60 + i * 120,
        );
        await settle();


        const headingEls = Array.from(root.querySelectorAll("h1,h2,h3,h4,h5,h6")) as HTMLElement[];
        const readCounts = headingEls.map(() => 0);
        headingEls.forEach((el, i) => {
            const original = el.getBoundingClientRect.bind(el);
            el.getBoundingClientRect = () => { readCounts[i]++; return original(); };
        });


        setViewport(300, 150);
        bodyWidth = 285;
        fireResize(document.body);
        await new Promise((r) => requestAnimationFrame(() => r(null)));


        setViewport(1024, 768);
        bodyWidth = 800;
        fireResize(document.body);
        await new Promise((r) => requestAnimationFrame(() => r(null)));


        expect(readCounts.filter((c) => c > 0).length).toBeLessThanOrEqual(1);

        bodySpy.mockRestore();
        setViewport(1024, 768);
        destroyEditor();
        root.remove();
    }, 60000);

    it("滚到文档底部时 应该 把最后一个标题当作当前章节（回归：尾部章节短，TOC 高亮与滚动到不了最下面）", async () => {



        setViewport(1024, 600);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 2000, configurable: true });
        scrollY = 1400;
        const root = await mountWithStubLayout(
            ["## 第一节", "正文", "正文", "## 尾部小节", "正文"],
            (i) => (i === 0 ? 60 : 1450),
        );
        await settle();

        const view = getEditorView();
        expect(view).not.toBeNull();
        const entries = buildHeadingIndex(view!.state.doc).filter((e) => e.topLevel);
        expect(entries).toHaveLength(2);
        expect(getActiveHeadingPos()).toBe(entries[1].pos);

        destroyEditor();
        root.remove();
    }, 60000);

    it("离底部还远时 应该 仍是最后一个划过吸顶线的标题（阅读线还没滑到尾部那节）", async () => {


        setViewport(1024, 600);
        Object.defineProperty(document.documentElement, "scrollHeight", { get: () => 2000, configurable: true });
        scrollY = 1000;
        const root = await mountWithStubLayout(
            ["## 第一节", "正文", "正文", "## 尾部小节", "正文"],
            (i) => (i === 0 ? 60 : 1450),
        );
        await settle();

        const view = getEditorView();
        const entries = buildHeadingIndex(view!.state.doc).filter((e) => e.topLevel);
        expect(getActiveHeadingPos()).toBe(entries[0].pos);

        destroyEditor();
        root.remove();
    }, 60000);

    it("缓存已脏时立即重建 应该 一并撤掉待触发的防抖定时器（回归：销毁后孤儿定时器仍重建 → 未捕获异常）", async () => {
        scrollY = 150;
        headingLeft = 100;
        headingWidth = 800;
        const root = await mountWithStubLayout(
            Array.from({ length: 6 }, (_, i) => `## 标题 ${i}\n正文一行`).flatMap((s) => s.split("\n")),
            (i) => 60 + i * 120,
        );
        await settle();


        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        try {

            const view = getEditorView();
            expect(view).not.toBeNull();
            view!.dispatch(view!.state.tr.insertText("改", 1));
            const pendingAfterChange = vi.getTimerCount();


            window.dispatchEvent(new Event("scroll"));
            await new Promise((r) => requestAnimationFrame(() => r(null)));


            expect(vi.getTimerCount()).toBe(pendingAfterChange - 1);

            destroyEditor();
            root.remove();
        } finally {
            vi.useRealTimers();
        }
    }, 60000);

    it("destroy 应该 复位当前标题位置并通知订阅者（F10：重建不继承旧文档的高亮）", async () => {
        setViewport(1024, 768);
        scrollY = 100;
        headingLeft = 100;
        headingWidth = 800;
        const root = await mountWithStubLayout(
            Array.from({ length: 4 }, (_, i) => `## 标题 ${i}\n正文一行`).flatMap((s) => s.split("\n")),
            (i) => 60 + i * 120,
        );
        await settle();
        expect(getActiveHeadingPos()).not.toBeNull();

        const published: Array<number | null> = [];
        const unsubscribe = onActiveHeadingChange((pos) => published.push(pos));
        try {
            destroyEditor();

            await vi.waitFor(() => expect(getActiveHeadingPos()).toBeNull());
        } finally {
            unsubscribe();
        }

        expect(published).toEqual([null]);
        root.remove();
    }, 60000);
});
