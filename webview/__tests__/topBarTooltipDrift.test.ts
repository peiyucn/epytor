/**
 * 顶栏 tooltip 的位置漂移告警（F5 的一半：让脆弱性可见）。
 *
 * Crepe 的 TopBarItem 不暴露 id，所以 tooltip 只能按 DOM 顺序贴。两份清单覆盖的集合并不相同
 * （我们配置的 group vs 所有渲染出来的按钮，含 Crepe 默认项），一旦上游增删/重排按钮，
 * tooltip 会静默贴错。这里守的是「数量不一致必须告警一次」。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** 等一帧：setupTopBarTooltips 在 rAF 里扫描 */
function nextFrame(): Promise<void> {
    return new Promise((resolve) => { requestAnimationFrame(() => resolve()); });
}

function makeContainer(itemCount: number): HTMLElement {
    const container = document.createElement("div");
    const topBar = document.createElement("div");
    topBar.className = "milkdown-top-bar";
    for (let i = 0; i < itemCount; i++) {
        const btn = document.createElement("button");
        btn.className = "top-bar-item";
        topBar.appendChild(btn);
    }
    container.appendChild(topBar);
    document.body.appendChild(container);
    return container;
}

describe("顶栏 tooltip 漂移告警", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
        document.body.innerHTML = "";
    });

    it("按钮数量与文案数量不一致时 应该 console.warn 一次", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { setupTopBarTooltips } = await import("../components/topBar/topBarDecorations");

        const container = makeContainer(3);   // 远少于文案表长度
        setupTopBarTooltips(container);
        await nextFrame();
        await nextFrame();

        const calls = warn.mock.calls.filter((args) => String(args[0]).includes("top-bar tooltips"));
        expect(calls).toHaveLength(1);
        warn.mockRestore();
    });

    it("重复扫描 应该 不重复告警（MutationObserver 每次重建都会触发）", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        const { setupTopBarTooltips } = await import("../components/topBar/topBarDecorations");

        const container = makeContainer(3);
        setupTopBarTooltips(container);
        await nextFrame();
        // 触发一次 observer 重扫
        container.querySelector(".milkdown-top-bar")!.appendChild(document.createElement("button"));
        await nextFrame();
        await nextFrame();

        const calls = warn.mock.calls.filter((args) => String(args[0]).includes("top-bar tooltips"));
        expect(calls).toHaveLength(1);
        warn.mockRestore();
    });
});
