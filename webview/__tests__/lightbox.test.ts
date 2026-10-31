/**
 * `ui/lightbox`：全屏灯箱的生命周期契约。
 *
 * 原先图片灯箱与代码块全屏各自维护一个模块级「当前灯箱」单例：Esc 监听、遮罩点击、
 * 关闭按钮、cleanup 幂等各写一遍，且 NodeView.destroy / 重建路径会二次触发 cleanup。
 * 收敛后这些语义必须逐条钉住，否则「灯箱关不掉」或「关两次抛错」会静默回归。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLightboxHost, type Lightbox, type LightboxOptions } from "../ui/lightbox";
import { closeCodeBlockLightbox, enhanceCodeBlocks } from "../components/codeBlockEnhance";
import { showGlobalLightbox } from "../components/imageView";

function buildContent(root: HTMLElement): { closeButton: HTMLElement } {
    const content = document.createElement("div");
    content.className = "test-lightbox-content";
    root.appendChild(content);
    const closeButton = document.createElement("button");
    closeButton.className = "test-lightbox-close";
    root.appendChild(closeButton);
    return { closeButton };
}

function openHost(host: ReturnType<typeof createLightboxHost>, overrides: Partial<LightboxOptions> = {}): Lightbox | null {
    return host.open({
        className: "test-lightbox",
        build: buildContent,
        ...overrides,
    });
}

function pressEscape(): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    document.dispatchEvent(event);
    return event;
}

describe("lightbox 打开与单例", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("open 应该 把灯箱挂到 body、执行 build、报告 isOpen", () => {
        const host = createLightboxHost();
        const lightbox = openHost(host);

        expect(lightbox).not.toBeNull();
        expect(lightbox!.el.className).toBe("test-lightbox");
        expect(document.body.contains(lightbox!.el)).toBe(true);
        expect(lightbox!.el.querySelector(".test-lightbox-content")).not.toBeNull();
        expect(lightbox!.isOpen()).toBe(true);
        expect(host.isOpen()).toBe(true);
        expect(host.active()).toBe(lightbox);
    });

    it("同时只能有一个灯箱：第二次 open 应该 返回 null 且不叠加", () => {
        const host = createLightboxHost();
        const first = openHost(host);
        const second = openHost(host);

        expect(first).not.toBeNull();
        expect(second).toBeNull();
        expect(document.querySelectorAll(".test-lightbox")).toHaveLength(1);
        expect(host.active()).toBe(first);
    });

    it("不同 host 之间 应该 互不影响（图片灯箱与代码块灯箱各自独立）", () => {
        const imageHost = createLightboxHost();
        const codeHost = createLightboxHost();
        const imageLightbox = openHost(imageHost, { className: "image-lightbox" });
        const codeLightbox = openHost(codeHost, { className: "code-lightbox" });

        expect(imageLightbox).not.toBeNull();
        expect(codeLightbox).not.toBeNull();
        expect(document.querySelectorAll(".image-lightbox")).toHaveLength(1);
        expect(document.querySelectorAll(".code-lightbox")).toHaveLength(1);

        codeHost.close();
        expect(document.querySelectorAll(".code-lightbox")).toHaveLength(0);
        expect(imageHost.isOpen()).toBe(true);
    });

    it("关闭后 应该 允许再次打开（重建路径）", () => {
        const host = createLightboxHost();
        const first = openHost(host);
        first!.close();
        const second = openHost(host);

        expect(second).not.toBeNull();
        expect(second).not.toBe(first);
        expect(host.isOpen()).toBe(true);
        expect(document.querySelectorAll(".test-lightbox")).toHaveLength(1);
    });
});

describe("lightbox 关闭契约", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
    });

    afterEach(() => {
        document.body.innerHTML = "";
    });

    it("Esc 应该 关闭并阻止默认行为", () => {
        const host = createLightboxHost();
        const lightbox = openHost(host)!;

        const event = pressEscape();

        expect(event.defaultPrevented).toBe(true);
        expect(lightbox.isOpen()).toBe(false);
        expect(document.body.contains(lightbox.el)).toBe(false);
        expect(host.isOpen()).toBe(false);
    });

    it("点击遮罩 应该 关闭；点击内容 不应该 关闭", () => {
        const host = createLightboxHost();
        const lightbox = openHost(host)!;

        lightbox.el.querySelector(".test-lightbox-content")!
            .dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(lightbox.isOpen()).toBe(true);

        lightbox.el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(lightbox.isOpen()).toBe(false);
    });

    it("关闭按钮 mousedown 应该 阻止默认/冒泡并关闭灯箱", () => {
        const host = createLightboxHost();
        const lightbox = openHost(host)!;
        const onDocumentMousedown = vi.fn();
        document.addEventListener("mousedown", onDocumentMousedown);

        const closeButton = lightbox.el.querySelector<HTMLElement>(".test-lightbox-close")!;
        const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
        closeButton.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(onDocumentMousedown).not.toHaveBeenCalled(); // stopPropagation
        expect(lightbox.isOpen()).toBe(false);
        document.removeEventListener("mousedown", onDocumentMousedown);
    });

    it("close 幂等 应该 不抛错，onDispose 只执行一次", () => {
        const host = createLightboxHost();
        const onDispose = vi.fn();
        const lightbox = openHost(host, { onDispose })!;

        expect(() => {
            lightbox.close();
            lightbox.close();
            host.close();
        }).not.toThrow();
        expect(onDispose).toHaveBeenCalledTimes(1);
    });

    it("host.close 应该 关闭当前灯箱（重建清理入口）", () => {
        const host = createLightboxHost();
        const lightbox = openHost(host)!;

        host.close();

        expect(lightbox.isOpen()).toBe(false);
        expect(document.body.contains(lightbox.el)).toBe(false);
    });

    it("onOpen 在挂载后执行，onDispose 在移除后执行", () => {
        const host = createLightboxHost();
        const order: string[] = [];
        let attachedAtOpen: boolean | null = null;
        let attachedAtDispose: boolean | null = null;
        const lightbox = openHost(host, {
            onOpen: (root) => {
                order.push("open");
                attachedAtOpen = document.body.contains(root);
            },
            onDispose: () => {
                order.push("dispose");
                attachedAtDispose = document.body.contains(lightbox!.el);
            },
        })!;

        lightbox.close();

        expect(order).toEqual(["open", "dispose"]);
        expect(attachedAtOpen).toBe(true);
        expect(attachedAtDispose).toBe(false);
    });

    it("onOpen 里搬入的 DOM 应该 由 onDispose 搬回（代码块全屏的恢复路径）", () => {
        const host = createLightboxHost();
        const originalParent = document.createElement("div");
        const editorEl = document.createElement("div");
        editorEl.textContent = "cm";
        originalParent.appendChild(editorEl);
        document.body.appendChild(originalParent);

        const lightbox = openHost(host, {
            onOpen: (root) => {
                root.appendChild(editorEl);
            },
            onDispose: () => {
                originalParent.appendChild(editorEl);
            },
        })!;
        expect(editorEl.parentElement).toBe(lightbox.el);

        lightbox.close();
        expect(editorEl.parentElement).toBe(originalParent);
    });
});

/**
 * 组件接线：灯箱外壳换成 `createLightboxHost` 之后，两个组件的「打开内容 / 关闭还原」
 * 仍必须由组件自身完成，因此这里验的是组件层行为而不是外壳本身。
 */
describe("组件接线：图片灯箱与代码块全屏", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
    });

    afterEach(async () => {
        closeCodeBlockLightbox();
        await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
        document.body.innerHTML = "";
    });

    it("showGlobalLightbox 应该 渲染图片/关闭按钮，Esc 关闭后不残留", () => {
        const lightbox = showGlobalLightbox("https://example.test/a.png", "alt text");

        expect(lightbox).not.toBeNull();
        const root = document.querySelector<HTMLElement>(".img-editor-lightbox");
        expect(root).not.toBeNull();
        const img = root!.querySelector<HTMLImageElement>(".img-editor-lightbox-img")!;
        expect(img.getAttribute("src")).toBe("https://example.test/a.png");
        expect(img.alt).toBe("alt text");
        expect(root!.querySelector(".img-editor-lightbox-close")).not.toBeNull();

        pressEscape();
        expect(document.querySelector(".img-editor-lightbox")).toBeNull();
    });

    it("代码块全屏：打开后搬入 cm-editor 与预览面板，Esc 关闭后搬回原位", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const block = document.createElement("div");
        block.className = "milkdown-code-block";
        const tools = document.createElement("div");
        tools.className = "tools-button-group";
        const langBtn = document.createElement("button");
        langBtn.className = "language-button";
        langBtn.textContent = "javascript";
        const cmHost = document.createElement("div");
        cmHost.className = "codemirror-host";
        const cmEditor = document.createElement("div");
        cmEditor.className = "cm-editor";
        cmHost.appendChild(cmEditor);
        const previewPanel = document.createElement("div");
        previewPanel.className = "preview-panel";
        block.append(tools, langBtn, cmHost, previewPanel);
        container.appendChild(block);

        enhanceCodeBlocks(container);
        // scanBlocks 在 rAF 里给新块补全屏按钮
        await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
        const fsBtn = block.querySelector<HTMLElement>(".epytor-fullscreen-btn");
        expect(fsBtn).not.toBeNull();

        fsBtn!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));

        const lightbox = document.querySelector<HTMLElement>(".epytor-fs-lightbox");
        expect(lightbox).not.toBeNull();
        expect(lightbox!.querySelector(".epytor-fs-lang")!.textContent).toBe("javascript");
        const body = lightbox!.querySelector(".epytor-fs-body")!;
        expect(body.contains(cmEditor)).toBe(true);
        expect(body.contains(previewPanel)).toBe(true);

        pressEscape();

        expect(document.querySelector(".epytor-fs-lightbox")).toBeNull();
        expect(cmEditor.parentElement).toBe(cmHost);
        expect(previewPanel.parentElement).toBe(block);
    });

    it("closeCodeBlockLightbox 应该 作为重建清理入口关闭灯箱并还原 DOM", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const block = document.createElement("div");
        block.className = "milkdown-code-block";
        const tools = document.createElement("div");
        tools.className = "tools-button-group";
        const cmHost = document.createElement("div");
        cmHost.className = "codemirror-host";
        const cmEditor = document.createElement("div");
        cmEditor.className = "cm-editor";
        cmHost.appendChild(cmEditor);
        block.append(tools, cmHost);
        container.appendChild(block);

        enhanceCodeBlocks(container);
        await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
        block.querySelector<HTMLElement>(".epytor-fullscreen-btn")!
            .dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        expect(document.querySelector(".epytor-fs-lightbox")).not.toBeNull();

        closeCodeBlockLightbox();

        expect(document.querySelector(".epytor-fs-lightbox")).toBeNull();
        expect(cmEditor.parentElement).toBe(cmHost);
    });
});
