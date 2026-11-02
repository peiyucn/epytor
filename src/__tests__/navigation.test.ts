import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { NavigationState, revealLineAtTop } from "../editor/navigation";

const URI_KEY = "file:///docs/note.md";

describe("NavigationState 导航状态", () => {
    let state: NavigationState;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        state = new NavigationState();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("待导航行号 应该 只消费一次", () => {
        state.rememberPendingNavigation(URI_KEY, 42);
        expect(state.consumePendingNavigation(URI_KEY)).toBe(42);
        expect(state.consumePendingNavigation(URI_KEY)).toBeUndefined();
    });

    it("待导航超过 TTL 应该 失效", () => {
        state.rememberPendingNavigation(URI_KEY, 42);
        vi.advanceTimersByTime(6000);
        expect(state.consumePendingNavigation(URI_KEY)).toBeUndefined();
    });

    it("全局 revealLine 应该 过期失效，且消费后不再返回", () => {
        state.setGlobalRevealLine(7);
        expect(state.consumeGlobalRevealLine()).toBe(7);
        expect(state.consumeGlobalRevealLine()).toBeUndefined();

        state.setGlobalRevealLine(9);
        vi.advanceTimersByTime(11_000);
        expect(state.consumeGlobalRevealLine()).toBeUndefined();
    });

    it("文本编辑器可见行 应该 读取即清除（避免每次激活都跳回）", () => {
        state.recordTextLine(URI_KEY, 5);
        expect(state.consumeLastTextLine(URI_KEY)).toBe(5);
        expect(state.consumeLastTextLine(URI_KEY)).toBeUndefined();
    });

    it("webview 最后视口行 应该 可反复读取，直到 dispose", () => {
        state.recordPreviewLine(URI_KEY, 12);
        expect(state.getPreviewLine(URI_KEY)).toBe(12);
        expect(state.getPreviewLine(URI_KEY)).toBe(12);
        state.dispose(URI_KEY);
        expect(state.getPreviewLine(URI_KEY)).toBeUndefined();
    });

    it("switch-to-source 的行号 应该 只交给匹配的文档", () => {
        state.stashEditorReveal(URI_KEY, 30);
        expect(state.hasPendingEditorReveal()).toBe(true);
        expect(state.takeEditorReveal("file:///other.md")).toBeUndefined();
        expect(state.hasPendingEditorReveal()).toBe(true);
        expect(state.takeEditorReveal(URI_KEY)).toBe(30);
        expect(state.hasPendingEditorReveal()).toBe(false);
    });

    it("dispose 应该 只清掉该文档的条目", () => {
        state.rememberPendingNavigation(URI_KEY, 1);
        state.rememberPendingNavigation("file:///keep.md", 2);
        state.recordTextLine(URI_KEY, 3);
        state.stashEditorReveal(URI_KEY, 4);

        state.dispose(URI_KEY);

        expect(state.consumePendingNavigation(URI_KEY)).toBeUndefined();
        expect(state.consumeLastTextLine(URI_KEY)).toBeUndefined();
        expect(state.hasPendingEditorReveal()).toBe(false);
        expect(state.consumePendingNavigation("file:///keep.md")).toBe(2);
    });
});

interface FakeEditor {
    document: { lineCount: number };
    selection: unknown;
    revealRange: ReturnType<typeof vi.fn>;
}

function makeEditor(lineCount: number): FakeEditor {
    return {
        document: { lineCount },
        selection: undefined,
        revealRange: vi.fn(),
    };
}

describe("revealLineAtTop 行定位", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("应该 把 1-indexed 行号放到视口顶部并放置光标", () => {
        const editor = makeEditor(100);
        revealLineAtTop(editor as unknown as vscode.TextEditor, 21);

        const selection = editor.selection as vscode.Selection;
        expect(selection.start.line).toBe(20);
        expect(selection.end.line).toBe(20);
        expect(editor.revealRange).toHaveBeenCalledTimes(1);
        const [range, revealType] = editor.revealRange.mock.calls[0] as [vscode.Range, number];
        expect(range.start.line).toBe(20);
        expect(revealType).toBe(vscode.TextEditorRevealType.AtTop);
    });

    it("越界行号 应该 夹紧到文档范围（回归：文档变短后还原旧行号）", () => {
        const editor = makeEditor(5);
        revealLineAtTop(editor as unknown as vscode.TextEditor, 999);
        expect((editor.selection as vscode.Selection).start.line).toBe(4);

        const negative = makeEditor(5);
        revealLineAtTop(negative as unknown as vscode.TextEditor, 0);
        expect((negative.selection as vscode.Selection).start.line).toBe(0);
    });
});
