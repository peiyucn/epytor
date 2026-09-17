/**
 * 回归（owner 手测 2026-09-17）：「输入文字的时候，TOC 里的内容总一下一下闪」。
 *
 * 根因：TOC 刷新判据用的是**带文档位置**的标题签名（`computeAllHeadingSignature` 逐标题拼
 * `pos:…`）。正文里每敲一个字，其后所有标题的 pos 都平移 → 签名必变 → 每条输入停顿都全量
 * 重建目录（`list.innerHTML = ""` 再逐个造 item + tooltip + 监听器、并重置列表滚动），
 * 用户看到的就是「目录内容一下一下闪」。
 *
 * 契约（本测试锁死 `refresh()` 的行为）：
 *   1. 标题结构未变的输入（最常见的正文打字）**不得**改动 `.toc-list` 的 DOM；
 *   2. 但「目录项 ↔ 标题当前位置」的绑定必须跟着更新——否则高亮与折叠会指向旧位置；
 *   3. 标题结构真的变了（改名/增删/层级变化）才重建，且重建后内容正确。
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
    translations: {},
    isMac: false,
    serializationMode: "clean",
};
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
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

/** 视口尺寸（只读属性需 defineProperty），让自动展开判据成立 */
function setViewport(width: number, height: number): void {
    Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
    Object.defineProperty(document.documentElement, "clientWidth", { value: width, configurable: true });
}

/** 建编辑器 + 桩测布局（jsdom 无布局：标题 rect 由 index 决定，随 scrollY 换算为视口坐标） */
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
    toc.toggle(); // 打开：关闭态下 refresh 是 no-op，测不到行为
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    return { list: document.querySelector<HTMLElement>(".toc-list")!, refresh: toc.refresh };
}

/** 「正文一」这段文本在文档里的起始位置（用 includes：连续输入后文本已被改写） */
function bodyTextPos(): number {
    const view = getEditorView()!;
    let pos = -1;
    view.state.doc.descendants((node, nodePos) => {
        if (node.isText && node.text?.includes("正文一")) pos = nodePos;
    });
    return pos;
}

/** 复刻 index.ts 的刷新节奏：正文里逐字输入 + 每次停顿刷新一次目录 */
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

        // 滚动触发吸顶插件重算「当前章节」→ 发布 → 目录高亮跟随
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
        const { list, refresh } = await mount();

        // 先建立高亮：scrollY=400 时「1.1 小节」已划过阅读线
        window.dispatchEvent(new Event("scroll"));
        await new Promise((r) => setTimeout(r, 500));
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        expect(list.querySelectorAll(".toc-item--active")).toHaveLength(1);

        // 正文里打字：标题 pos 整体平移，吸顶插件按新位置发布；但 TOC 的防抖刷新还没到点。
        // 此时绑定若仍是旧位置，高亮会先被清空、等刷新后才回来 —— 用户看到「闪一下」。
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
        // 第一章 的标题节点起始 pos 为 0，其文字从 1 开始
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
});
