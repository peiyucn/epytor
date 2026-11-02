/**
 * 图片内联编辑的清理契约（回归：节点在路径补全打开时被销毁，document 监听泄漏）。
 *
 * 场景：编辑图片路径时节点消失（revert / undo / 外部改盘），原来的 detach 只在
 * confirm/cancel 里执行，document 上的 mousedown 监听就永久留下。现在
 * `startToolbarInlineEdit` 返回清理函数，`createImageView` 存下它并在 `destroy()` 调用。
 *
 * 两条路径的键盘归属不同，必须分开测：
 * - 纯重命名（无 `setupComplete`）：输入框自己处理 Enter/Escape；
 * - 路径编辑（有 `setupComplete`）：键盘归路径补全组件，我们只负责清理契约。
 */
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

        cleanup();   // confirm / cancel 走的那次
        cleanup();   // 随后节点 destroy 又调一次

        expect(detach).toHaveBeenCalledTimes(1);
        expect(toolbar.querySelector("input")).toBeNull();
    });
});
