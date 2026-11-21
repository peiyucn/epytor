
import { beforeEach, describe, expect, it, vi } from "vitest";

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

        const container = makeContainer(3);
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

        container.querySelector(".milkdown-top-bar")!.appendChild(document.createElement("button"));
        await nextFrame();
        await nextFrame();

        const calls = warn.mock.calls.filter((args) => String(args[0]).includes("top-bar tooltips"));
        expect(calls).toHaveLength(1);
        warn.mockRestore();
    });
});
