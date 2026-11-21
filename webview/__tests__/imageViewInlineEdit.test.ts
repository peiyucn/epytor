
import { beforeEach, describe, expect, it, vi } from "vitest";
import { startToolbarInlineEdit } from "../components/imageView";

function makeToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    document.body.appendChild(toolbar);
    return toolbar;
}

describe("图片内联编辑的清理", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
    });

    it("纯重命名路径：Enter 确认 应该 移除输入框", () => {
        const toolbar = makeToolbar();
        const onConfirm = vi.fn();
        startToolbarInlineEdit(toolbar, {
            initialValue: "old",
            placeholder: "p",
            onConfirm,
        });

        const input = toolbar.querySelector<HTMLInputElement>("input")!;
        expect(input).not.toBeNull();
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));

        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(toolbar.querySelector("input")).toBeNull();
    });

    it("纯重命名路径：Escape 取消 应该 移除输入框", () => {
        const toolbar = makeToolbar();
        const onCancel = vi.fn();
        startToolbarInlineEdit(toolbar, {
            initialValue: "old",
            placeholder: "p",
            onConfirm: vi.fn(),
            onCancel,
        });

        const input = toolbar.querySelector<HTMLInputElement>("input")!;
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(toolbar.querySelector("input")).toBeNull();
    });

    it("路径补全路径：返回的清理 应该 调用 detach 且幂等（destroy 之后不会再重复执行）", () => {
        const toolbar = makeToolbar();
        const detach = vi.fn();
        const cleanup = startToolbarInlineEdit(toolbar, {
            initialValue: "old",
            placeholder: "p",
            setupComplete: () => detach,
            onConfirm: vi.fn(),
        });

        expect(toolbar.querySelector("input")).not.toBeNull();

        cleanup();
        cleanup();

        expect(detach).toHaveBeenCalledTimes(1);
        expect(toolbar.querySelector("input")).toBeNull();
    });
});
