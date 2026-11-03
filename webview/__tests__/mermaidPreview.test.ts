/**
 * Mermaid 预览控制器（覆盖 editor/mermaidPreview.ts）。
 * 用注入的 loader 断言懒加载、data-mermaid-key 所有权、主题切换只重渲染仍存在的块、
 * 错误降级文本，不触发真实的 1.3MB mermaid 动态导入。语言路由由
 * editor/codeBlockPreview.ts 负责（见 codeBlockPreview.test.ts），这里只渲染 mermaid。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMermaidPreview, type MermaidPreviewOptions } from "../editor/mermaidPreview";
import { mermaidInitConfig } from "../editor/mermaid";

interface FakeMermaidModule {
    initialize: ReturnType<typeof vi.fn>;
    render: ReturnType<typeof vi.fn>;
}

type Loader = MermaidPreviewOptions["loadMermaidModule"];

function asLoader(load: () => Promise<FakeMermaidModule>): Loader {
    return load as unknown as Loader;
}

function fakeMermaid(): { module: FakeMermaidModule; load: () => Promise<FakeMermaidModule>; loadCount: () => number } {
    let loads = 0;
    const module: FakeMermaidModule = {
        initialize: vi.fn(),
        render: vi.fn(async () => ({ svg: "<svg data-test-svg=\"1\"></svg>" })),
    };
    return {
        module,
        load: () => {
            loads += 1;
            return Promise.resolve(module);
        },
        loadCount: () => loads,
    };
}

/** 把 apply 的 HTML 挂进 body（真实调用方是代码块预览区）。 */
function mountApply(): { apply: (value: null | string | HTMLElement) => void; host: HTMLElement } {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const apply = (value: null | string | HTMLElement): void => {
        if (value === null) { host.innerHTML = ""; return; }
        if (typeof value === "string") { host.innerHTML = value; return; }
        host.replaceChildren(value);
    };
    return { apply, host };
}

async function flushAsync(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("createMermaidPreview", () => {
    it("首次渲染 mermaid 块前 应该 不加载模块（惰性加载），并把 host 挂上 data-mermaid-key", async () => {
        const { module, load, loadCount } = fakeMermaid();
        const preview = createMermaidPreview(() => false, { loadMermaidModule: asLoader(load) });
        const { apply, host } = mountApply();

        expect(loadCount()).toBe(0);
        const result = preview.renderPreview("graph TD; A-->B", apply);

        // 异步预览：返回 undefined 让组件保留 Loading 占位，apply 同步挂上块占位。
        expect(result).toBeUndefined();
        const block = host.querySelector<HTMLElement>("[data-mermaid-key]");
        expect(block).not.toBeNull();
        expect(block!.dataset["mermaidKey"]).toMatch(/^m-\d+$/);

        await flushAsync();
        expect(loadCount()).toBe(1);
        expect(module.initialize).toHaveBeenCalledWith(mermaidInitConfig(false));
        expect(module.render).toHaveBeenCalledTimes(1);
        expect(module.render.mock.calls[0][1]).toBe("graph TD; A-->B");
        expect(block!.innerHTML).toContain("data-test-svg");
    });

    it("主题切换 应该 重新 initialize，且只重渲染仍在 DOM 里的块（清理失效 key）", async () => {
        const { module, load } = fakeMermaid();
        let dark = false;
        const preview = createMermaidPreview(() => dark, { loadMermaidModule: asLoader(load) });
        const first = mountApply();
        const second = mountApply();

        preview.renderPreview("graph TD; A-->A1", first.apply);
        preview.renderPreview("graph TD; B-->B1", second.apply);
        await flushAsync();
        expect(module.render).toHaveBeenCalledTimes(2);

        // 第一个块的节点被编辑器重建移除；主题切换时不应再为它查询/渲染。
        first.host.remove();
        const renderCallsBefore = module.render.mock.calls.length;
        dark = true;
        preview.applyTheme();
        await flushAsync();

        expect(module.initialize).toHaveBeenLastCalledWith(mermaidInitConfig(true));
        expect(module.render.mock.calls.length).toBe(renderCallsBefore + 1);
        expect(module.render.mock.calls[module.render.mock.calls.length - 1][1]).toBe("graph TD; B-->B1");
    });

    it("从未渲染时 applyTheme 应该 是 no-op（不加载模块）", () => {
        const { load, loadCount } = fakeMermaid();
        const preview = createMermaidPreview(() => false, { loadMermaidModule: asLoader(load) });
        expect(() => preview.applyTheme()).not.toThrow();
        expect(loadCount()).toBe(0);
    });

    it("渲染失败 应该 在块内显示 Mermaid 错误文本而不是抛出", async () => {
        const module: FakeMermaidModule = {
            initialize: vi.fn(),
            render: vi.fn(async () => { throw new Error("bad syntax"); }),
        };
        const preview = createMermaidPreview(() => false, { loadMermaidModule: asLoader(() => Promise.resolve(module)) });
        const { apply, host } = mountApply();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { /* expected */ });

        preview.renderPreview("((( bad", apply);
        await flushAsync();

        const block = host.querySelector<HTMLElement>("[data-mermaid-key]");
        expect(block!.innerHTML).toContain("Mermaid:");
        expect(block!.innerHTML).toContain("bad syntax");
        expect(warn).toHaveBeenCalled();
    });
});
