/**
 * `ui/pathCompleteCore` 的共享部件：建议行渲染、目录选中后重触发、完成会话的幂等销毁。
 *
 * 这两段逻辑原先在两个补全流程里各写一遍（且已经漂移），抽到 core 后必须由用例锁住，
 * 否则「图片补全/正文补全改一处漏一处」的老问题会从别处长回来。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createCompletionTeardown,
    pathLastSegment,
    renderPathSuggestionItem,
    retriggerCompletionAfterDirectoryPick,
} from "../ui/pathCompleteCore";
import { PATH_COMPLETE_RETRIGGER_DELAY_MS } from "../../shared/constants";
import type { PathSuggestionItem } from "../../shared/messages";

const item = (path: string, isDir = false, webviewUri?: string): PathSuggestionItem => ({
    path,
    isDir,
    webviewUri,
});

describe("pathLastSegment", () => {
    it("应该 取最后一段；目录尾斜杠 应该 被忽略", () => {
        expect(pathLastSegment("a/b/c.md")).toBe("c.md");
        expect(pathLastSegment("images/")).toBe("images");
        expect(pathLastSegment("/abs/dir/")).toBe("dir");
        expect(pathLastSegment("plain.md")).toBe("plain.md");
    });
});

describe("renderPathSuggestionItem", () => {
    it("普通项 应该 渲染图标 + 标签，使用调用方给定的 class", () => {
        const html = renderPathSuggestionItem(item("src/a/notes.md"), {
            iconHtml: "<svg>icon</svg>",
            iconClass: "my-icon",
            labelClass: "my-label",
        });

        expect(html).toBe('<span class="my-icon"><svg>icon</svg></span><span class="my-label">notes.md</span>');
    });

    it("目录项 应该 显示目录名（尾斜杠不进标签）", () => {
        const html = renderPathSuggestionItem(item("assets/images/", true), {
            iconHtml: "<svg>dir</svg>",
            iconClass: "i",
            labelClass: "l",
        });

        expect(html).toContain(">images</span>");
    });

    it("图片缩略图分支 应该 渲染 img + 标签，并转义路径/URI", () => {
        const html = renderPathSuggestionItem(item("<img>.png", false, "https://x.test/a.png?x=1&y=2"), {
            iconHtml: "",
            iconClass: "i",
            labelClass: "l",
            thumbnail: { className: "thumb", webviewUri: "https://x.test/a.png?x=1&y=2" },
        });

        expect(html).toContain('<img class="thumb" src="https://x.test/a.png?x=1&amp;y=2" alt="">');
        // 标签走 escapeHtml：路径里的尖括号不能变成真正的 DOM 标签
        expect(html).toContain("&lt;img&gt;.png</span>");
        expect(html).not.toContain("<img>.png</span>");
    });
});

describe("retriggerCompletionAfterDirectoryPick", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("选中目录后 应该 先关闭下拉，延迟到重触发时机再重新请求", () => {
        const dropdown = { close: vi.fn() };
        const retrigger = vi.fn();

        retriggerCompletionAfterDirectoryPick(dropdown, retrigger);

        expect(dropdown.close).toHaveBeenCalledTimes(1);
        expect(retrigger).not.toHaveBeenCalled();

        vi.advanceTimersByTime(PATH_COMPLETE_RETRIGGER_DELAY_MS);
        expect(retrigger).toHaveBeenCalledTimes(1);
    });
});

describe("createCompletionTeardown", () => {
    it("dispose 应该 按 定时器 → 下拉 → 监听器 的顺序执行且只执行一次", () => {
        const order: string[] = [];
        const teardown = createCompletionTeardown({
            clearTimer: () => order.push("timer"),
            closeDropdown: () => order.push("dropdown"),
            removeListeners: () => order.push("listeners"),
        });

        expect(teardown.disposed).toBe(false);
        teardown.dispose();
        teardown.dispose();

        expect(order).toEqual(["timer", "dropdown", "listeners"]);
        expect(teardown.disposed).toBe(true);
    });
});
