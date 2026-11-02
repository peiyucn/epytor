/**
 * `ui/modifierKeys`：Ctrl/Meta 按住状态的单一来源。
 *
 * 原先 index.ts（body class）与 pathLink（cmdHeld）各维护一份，收敛后 pathLink 的
 * 悬停高亮必须跟随共享状态；本文件同时覆盖状态机本身与 pathLink 的接线。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    installModifierKeyTracking,
    isModifierActive,
    onModifierChange,
} from "../ui/modifierKeys";
import { setupPathLink } from "../components/pathLink";

function keyDown(init: KeyboardEventInit): void {
    document.dispatchEvent(new KeyboardEvent("keydown", init));
}

function keyUp(init: KeyboardEventInit): void {
    document.dispatchEvent(new KeyboardEvent("keyup", init));
}

/** 状态是页面级单例：每个用例结束把状态复位，避免互相污染 */
function resetModifierState(): void {
    keyUp({ key: "Control" });
}

describe("modifierKeys 状态机", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        installModifierKeyTracking();
        resetModifierState();
        document.body.className = "";
    });

    afterEach(() => {
        resetModifierState();
        document.body.className = "";
    });

    it("按下 Ctrl 应该 置为按住并镜像 body class", () => {
        expect(isModifierActive()).toBe(false);

        keyDown({ key: "Control", ctrlKey: true });

        expect(isModifierActive()).toBe(true);
        expect(document.body.classList.contains("epytor-modifier-active")).toBe(true);
    });

    it("按下 Meta 应该 同样生效（跨平台统一，与点击判定一致）", () => {
        keyDown({ key: "Meta", metaKey: true });
        expect(isModifierActive()).toBe(true);

        keyUp({ key: "Meta" });
        expect(isModifierActive()).toBe(false);
    });

    it("松开 应该 清除状态与 body class", () => {
        keyDown({ key: "Control", ctrlKey: true });
        keyUp({ key: "Control" });

        expect(isModifierActive()).toBe(false);
        expect(document.body.classList.contains("epytor-modifier-active")).toBe(false);
    });

    it("仍按住 Ctrl 时 松开其它键 不应该 清除状态", () => {
        keyDown({ key: "Control", ctrlKey: true });
        keyDown({ key: "a", ctrlKey: true });
        keyUp({ key: "a", ctrlKey: true });

        expect(isModifierActive()).toBe(true);
        resetModifierState();
    });

    it("窗口失焦 应该 复位（Cmd+Tab 收不到 keyup）", () => {
        keyDown({ key: "Control", ctrlKey: true });

        window.dispatchEvent(new Event("blur"));

        expect(isModifierActive()).toBe(false);
        expect(document.body.classList.contains("epytor-modifier-active")).toBe(false);
    });

    it("订阅 应该 只在状态翻转时收到通知，退订后不再收到", () => {
        const listener = vi.fn();
        const unsubscribe = onModifierChange(listener);

        keyDown({ key: "Control", ctrlKey: true });
        keyDown({ key: "a", ctrlKey: true }); // 状态未变：不重复通知
        keyUp({ key: "Control" });

        expect(listener.mock.calls.map((call) => call[0])).toEqual([true, false]);

        unsubscribe();
        keyDown({ key: "Control", ctrlKey: true });
        expect(listener).toHaveBeenCalledTimes(2);
        resetModifierState();
    });
});

describe("pathLink 接线：悬停高亮跟随共享修饰键状态", () => {
    let container: HTMLElement;
    let code: HTMLElement;

    beforeEach(() => {
        vi.clearAllMocks();
        installModifierKeyTracking();
        resetModifierState();
        document.body.className = "";
        document.body.innerHTML = "";
        container = document.createElement("div");
        code = document.createElement("code");
        code.textContent = "./b.md";
        container.appendChild(code);
        document.body.appendChild(container);
        setupPathLink(container);
    });

    afterEach(() => {
        resetModifierState();
        document.body.innerHTML = "";
    });

    it("按住 Ctrl 后悬停路径 应该 高亮；松开 应该 取消高亮", () => {
        keyDown({ key: "Control", ctrlKey: true });
        code.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

        expect(code.classList.contains("path-link--active")).toBe(true);

        keyUp({ key: "Control" });

        expect(code.classList.contains("path-link--active")).toBe(false);
    });

    it("悬停时再按下 Ctrl 应该 立即高亮（原 cmdHeld 分支）", () => {
        code.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        expect(code.classList.contains("path-link--active")).toBe(false);

        keyDown({ key: "Control", ctrlKey: true });

        expect(code.classList.contains("path-link--active")).toBe(true);
    });

    it("未按住修饰键时 悬停 应该 不高亮", () => {
        code.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
        expect(code.classList.contains("path-link--active")).toBe(false);
    });
});
