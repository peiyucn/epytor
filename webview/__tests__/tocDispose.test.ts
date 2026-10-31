/**
 * TOC 实例的可拆装性（回归：`tocRefresh` 需要在同一文件里起第二个实例，前一实例的 window
 * 监听与吸顶订阅会叠加在它上面）。
 *
 * 页面生命周期下这不是泄漏修复——webview 与页面同寿命。dispose 存在的目的是让「第二个实例」
 * 从干净状态开始，而不是叠在前一个之上。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initToc } from "../components/toc";

describe("TOC 实例的 dispose", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = "";
    });

    it("dispose 应该 摘掉 window 监听并移除面板与把手", () => {
        const add = vi.spyOn(window, "addEventListener");
        const remove = vi.spyOn(window, "removeEventListener");

        const toc = initToc(() => null);
        document.body.appendChild(toc.panel);   // the caller owns mounting
        const resizeAdded = add.mock.calls.filter((c) => c[0] === "resize").length;
        expect(resizeAdded).toBeGreaterThan(0);
        expect(document.querySelector(".toc-panel")).not.toBeNull();
        expect(document.querySelector(".toc-toggle-tab")).not.toBeNull();

        toc.dispose();

        const resizeRemoved = remove.mock.calls.filter((c) => c[0] === "resize").length;
        expect(resizeRemoved).toBe(resizeAdded);
        expect(document.querySelector(".toc-panel")).toBeNull();
        expect(document.querySelector(".toc-toggle-tab")).toBeNull();
    });

    it("重复 dispose 应该 幂等（不会重复摘监听）", () => {
        const remove = vi.spyOn(window, "removeEventListener");
        const toc = initToc(() => null);

        toc.dispose();
        const first = remove.mock.calls.length;
        toc.dispose();
        expect(remove.mock.calls.length).toBe(first);
    });

    it("两个实例 应该 各自独立拆除（第二个的 dispose 不影响第一个）", () => {
        const first = initToc(() => null);
        document.body.appendChild(first.panel);
        const second = initToc(() => null);
        document.body.appendChild(second.panel);
        expect(document.querySelectorAll(".toc-panel")).toHaveLength(2);

        second.dispose();
        expect(document.querySelectorAll(".toc-panel")).toHaveLength(1);

        first.dispose();
        expect(document.querySelectorAll(".toc-panel")).toHaveLength(0);
    });
});
