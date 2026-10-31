/**
 * 链接点击与锚点滚动行为（覆盖 app/linkBehavior.ts）。
 * 拆分自 index.ts（audit F1）；用例锁住：锚点在原地平滑滚动、Ctrl/Cmd+Click 走注入的
 * 打开回调、URL scheme 走白名单、非 Ctrl 点击不打开任何东西、捕获阶段先于下游监听。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initLinkBehavior } from "../app/linkBehavior";

let container: HTMLElement;
let openUrl: ReturnType<typeof vi.fn<(url: string) => void>>;
let openFile: ReturnType<typeof vi.fn<(relativePath: string) => void>>;

beforeEach(() => {
    document.body.innerHTML = "";
    container = document.createElement("div");
    document.body.appendChild(container);
    openUrl = vi.fn<(url: string) => void>();
    openFile = vi.fn<(relativePath: string) => void>();
    initLinkBehavior(container, { openUrl, openFile });
});

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

function addAnchor(href: string, text = "link"): HTMLAnchorElement {
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = text;
    container.appendChild(anchor);
    return anchor;
}

function click(target: Element, init: MouseEventInit = {}): MouseEvent {
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
}

describe("锚点链接", () => {
    it("点击 #id 链接 应该 原地平滑滚动到对应元素（不交给扩展）", () => {
        const heading = document.createElement("h2");
        heading.id = "intro";
        heading.getBoundingClientRect = () => ({
            height: 40,
            top: 120,
            bottom: 160,
            left: 0,
            right: 0,
            width: 0,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.appendChild(heading);
        const anchor = addAnchor("#intro");
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => { /* 断言调用即可 */ });

        const event = click(anchor);
        expect(event.defaultPrevented).toBe(true);
        expect(scrollTo).toHaveBeenCalledTimes(1);
        const arg = scrollTo.mock.calls[0][0] as ScrollToOptions;
        expect(arg.behavior).toBe("smooth");
        expect(Number.isFinite(arg.top)).toBe(true);
        expect(openUrl).not.toHaveBeenCalled();
        expect(openFile).not.toHaveBeenCalled();
    });

    it("点击 #id 但目标不存在 应该 只拦截默认行为（不滚动、不打开）", () => {
        const anchor = addAnchor("#missing");
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => { /* noop */ });
        click(anchor);
        expect(scrollTo).not.toHaveBeenCalled();
        expect(openFile).not.toHaveBeenCalled();
    });
});

describe("Ctrl/Cmd + 点击", () => {
    it("Ctrl+点击 http(s) URL 应该 交给扩展打开（去掉 #fragment）", () => {
        const anchor = addAnchor("https://example.com/page#section");
        click(anchor, { ctrlKey: true });
        expect(openUrl).toHaveBeenCalledWith("https://example.com/page");
        expect(openFile).not.toHaveBeenCalled();
    });

    it("Cmd+点击（macOS） 也应该 打开 URL", () => {
        const anchor = addAnchor("https://example.com/");
        click(anchor, { metaKey: true });
        expect(openUrl).toHaveBeenCalledWith("https://example.com/");
    });

    it("Ctrl+点击相对路径 应该 交给扩展打开文件（保留 ./ 写法，#L 行号被去掉）", () => {
        const anchor = addAnchor("./docs/b.md#L20");
        click(anchor, { ctrlKey: true });
        expect(openFile).toHaveBeenCalledWith("./docs/b.md");
        expect(openUrl).not.toHaveBeenCalled();
    });

    it("Ctrl+点击非白名单 scheme（javascript:） 不应该 走 openUrl", () => {
        const anchor = addAnchor("javascript:alert(1)");
        click(anchor, { ctrlKey: true });
        expect(openUrl).not.toHaveBeenCalled();
    });

    it("普通点击（无修饰键）外链 应该 既不滚动也不打开任何东西", () => {
        const anchor = addAnchor("https://example.com/");
        const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => { /* noop */ });
        click(anchor);
        expect(openUrl).not.toHaveBeenCalled();
        expect(openFile).not.toHaveBeenCalled();
        expect(scrollTo).not.toHaveBeenCalled();
    });
});

describe("事件拦截", () => {
    it("捕获阶段 应该 先于下游（stopImmediatePropagation 阻止冒泡监听）", () => {
        const shadow = document.createElement("span");
        const anchor = addAnchor("https://example.com/");
        anchor.replaceChildren(shadow);
        const bubbleListener = vi.fn();
        container.addEventListener("click", bubbleListener);

        click(shadow, { ctrlKey: true });
        expect(bubbleListener).not.toHaveBeenCalled();
        expect(openUrl).toHaveBeenCalled();
    });

    it("非链接目标 应该 完全放行（不 preventDefault、不调用任何打开回调）", () => {
        const plain = document.createElement("span");
        plain.textContent = "text";
        container.appendChild(plain);
        const event = click(plain);
        expect(event.defaultPrevented).toBe(false);
        expect(openUrl).not.toHaveBeenCalled();
        expect(openFile).not.toHaveBeenCalled();
    });
});
