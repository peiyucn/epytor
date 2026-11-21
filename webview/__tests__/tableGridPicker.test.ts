
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openTableGridPicker, closeTableGridPicker } from "../components/tableGridPicker";

function pressEscape(): void {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
}

describe("tableGridPicker", () => {
    let anchor: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        anchor = document.createElement("button");
        document.body.appendChild(anchor);
    });

    afterEach(() => {
        closeTableGridPicker();
        document.body.innerHTML = "";
    });

    it("open 应该 在 body 挂出 8×8 网格并标记 role/aria", () => {
        openTableGridPicker(anchor, vi.fn());

        const panel = document.querySelector<HTMLElement>(".epytor-grid-picker");
        expect(panel).not.toBeNull();
        expect(panel!.parentElement).toBe(document.body);
        expect(panel!.getAttribute("role")).toBe("grid");
        expect(panel!.querySelectorAll(".epytor-grid-picker__cell")).toHaveLength(64);
        expect(panel!.querySelector(".epytor-grid-picker__label")!.textContent).toBe("Insert Table");
    });

    it("悬停第 2 行第 3 列 应该 高亮前 6 格并更新标签", () => {
        openTableGridPicker(anchor, vi.fn());
        const cells = document.querySelectorAll<HTMLElement>(".epytor-grid-picker__cell");


        cells[10].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

        const label = document.querySelector(".epytor-grid-picker__label");
        expect(label!.textContent).toBe("2 × 3");
        const active = document.querySelectorAll(".epytor-grid-picker__cell--active");
        expect(active).toHaveLength(6);
    });

    it("点击格子 应该 关闭浮层并回调行列数", () => {
        const onPick = vi.fn();
        openTableGridPicker(anchor, onPick);
        const cells = document.querySelectorAll<HTMLElement>(".epytor-grid-picker__cell");

        cells[10].dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(onPick).toHaveBeenCalledWith(2, 3);
        expect(document.querySelector(".epytor-grid-picker")).toBeNull();
    });

    it("Esc 应该 关闭浮层", () => {
        openTableGridPicker(anchor, vi.fn());
        pressEscape();
        expect(document.querySelector(".epytor-grid-picker")).toBeNull();
    });

    it("mousedown 浮层外部 应该 关闭浮层", () => {
        openTableGridPicker(anchor, vi.fn());
        document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        expect(document.querySelector(".epytor-grid-picker")).toBeNull();
    });

    it("重复 open 应该 只保留一个浮层（幂等）", () => {
        openTableGridPicker(anchor, vi.fn());
        openTableGridPicker(anchor, vi.fn());
        expect(document.querySelectorAll(".epytor-grid-picker")).toHaveLength(1);
    });

    it("closeTableGridPicker 应该 幂等且移除浮层", () => {
        openTableGridPicker(anchor, vi.fn());
        expect(() => {
            closeTableGridPicker();
            closeTableGridPicker();
        }).not.toThrow();
        expect(document.querySelector(".epytor-grid-picker")).toBeNull();
    });
});
