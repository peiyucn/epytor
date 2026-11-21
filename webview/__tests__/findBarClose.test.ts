
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initFindBar } from "../components/findBar";

describe("findBar 关闭清理（P3）", () => {
    let container: HTMLElement;

    beforeEach(() => {
        vi.useFakeTimers();
        container = document.createElement("div");
        container.innerHTML = "<p>alpha</p><p>beta</p>";
        document.body.appendChild(container);
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("输入防抖未到点就关闭 应该 不再执行搜索（回归：高亮/计数复活）", () => {
        const bar = initFindBar(() => container);
        bar.open("alpha");
        expect(bar.isOpen()).toBe(true);

        const input = document.querySelector<HTMLInputElement>(".find-bar input, .find-bar__input")!;
        input.value = "beta";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        bar.close();

        vi.advanceTimersByTime(300);
        const countEl = document.querySelector<HTMLElement>(".find-bar__count, .find-bar .count");
        expect(bar.isOpen()).toBe(false);
        expect(countEl?.textContent ?? "").toBe("");
    });
});
