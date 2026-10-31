import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { StatusBarPresenter, type WordCount } from "../editor/statusBar";

const URI_KEY = "file:///docs/note.md";

const WORD_COUNT: WordCount = { lines: 10, words: 1234, charsNoSpace: 5678, charsWithSpace: 6000 };

/** VSCode FileStat needs timestamps; only `type`/`size` matter to the code under test. */
function fileStat(type: vscode.FileType, size = 0): vscode.FileStat {
    return { type, ctime: 0, mtime: 0, size };
}

interface FakeStatusBarItem {
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    text: string;
    tooltip: string;
}

function lastCreatedItem(): FakeStatusBarItem {
    const results = vi.mocked(vscode.window.createStatusBarItem).mock.results;
    return results[results.length - 1].value as FakeStatusBarItem;
}

describe("StatusBarPresenter 状态栏", () => {
    let activeUriKey: string | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        activeUriKey = URI_KEY;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function makePresenter(): StatusBarPresenter {
        return new StatusBarPresenter(() => activeUriKey);
    }

    it("构造 应该 创建右侧状态栏项并先隐藏", () => {
        makePresenter();
        expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
            vscode.StatusBarAlignment.Right,
            100,
        );
        expect(lastCreatedItem().hide).toHaveBeenCalled();
    });

    it("当前面板有字数 应该 显示行/字/字符 并附 tooltip", () => {
        const presenter = makePresenter();
        presenter.setWordCount(URI_KEY, WORD_COUNT);
        const item = lastCreatedItem();

        expect(item.text).toBe("Lines(src): 10  Words: 1,234  Chars: 5,678");
        expect(item.tooltip).toBe("Chars (with spaces): 6,000");
        expect(item.show).toHaveBeenCalled();
    });

    it("没有当前面板字数 应该 隐藏（切到非 markdown 标签）", () => {
        activeUriKey = undefined;
        const presenter = makePresenter();
        presenter.setWordCount(URI_KEY, WORD_COUNT);
        expect(lastCreatedItem().hide).toHaveBeenCalled();
    });

    it("文件大小 应该 并入文本；stat 失败则省略该段而不显示 0 B", async () => {
        const presenter = makePresenter();
        presenter.setWordCount(URI_KEY, WORD_COUNT);
        const statMock = vi.mocked(vscode.workspace.fs.stat);

        statMock.mockResolvedValueOnce(fileStat(vscode.FileType.File, 2048));
        await presenter.refreshFileSize({ uri: vscode.Uri.file("/docs/note.md") }, URI_KEY);
        expect(lastCreatedItem().text).toContain("Size: 2.0 KB");

        statMock.mockRejectedValueOnce(new Error("OneDrive placeholder"));
        await presenter.refreshFileSize({ uri: vscode.Uri.file("/docs/note.md") }, URI_KEY);
        expect(lastCreatedItem().text).toBe("Lines(src): 10  Words: 1,234  Chars: 5,678");
    });

    it("dispose 后该文档字数缓存 应该 清掉（回归：关闭面板残留状态）", () => {
        const presenter = makePresenter();
        presenter.setWordCount(URI_KEY, WORD_COUNT);
        presenter.dispose(URI_KEY);

        const item = lastCreatedItem();
        item.hide.mockClear();
        presenter.refresh();
        expect(item.hide).toHaveBeenCalled();
    });
});
