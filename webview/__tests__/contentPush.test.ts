/**
 * 未落盘内容推送 + 选区/滚动位置持久化（覆盖 app/persistence.ts）。
 * 拆分自 index.ts（audit F1/F10）；用例锁住 400ms 尾沿推送、blur/pagehide 立即 flush、
 * requestContent 清脏、releaseDocTimers 的取消，以及滚动/选区快照的防抖写入。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { initSessionPersistence, type PersistenceDeps } from "../app/persistence";

/** 只有一个内容块的视图桩，供可见行换算使用。 */
function fakeView(extra: Record<string, unknown> = {}): EditorView {
    const block = document.createElement("div");
    block.getBoundingClientRect = () => ({
        height: 120,
        top: 0,
        bottom: 120,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
    } as DOMRect);
    const doc = { forEach: (fn: (node: unknown, offset: number) => void) => fn({}, 0) };
    return { state: { doc }, nodeDOM: () => block, ...extra } as unknown as EditorView;
}

/** 真实 ProseMirror 选区（TextSelection instanceof 判定需要真实实例）。 */
function viewWithSelection(from: number, to: number): EditorView {
    const schema = new Schema({
        nodes: {
            doc: { content: "text*" },
            text: { inline: true, group: "inline" },
        },
        marks: {},
    });
    let state = EditorState.create({
        schema,
        doc: schema.node("doc", null, [schema.text("hello world")]),
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
    return { state } as unknown as EditorView;
}

function createPersistence(overrides: Partial<PersistenceDeps> = {}): {
    persistence: ReturnType<typeof initSessionPersistence>;
    deps: PersistenceDeps & {
        notifyUnsavedContent: ReturnType<typeof vi.fn>;
        notifyViewportLine: ReturnType<typeof vi.fn>;
        setState: ReturnType<typeof vi.fn>;
        getState: ReturnType<typeof vi.fn>;
    };
} {
    const deps = {
        getView: () => fakeView(),
        getMarkdownForSave: () => "# draft\n",
        getLineMaps: () => ({ lineMap: [1], lineEndMap: [1] }),
        getState: vi.fn(() => null as Record<string, unknown> | null),
        setState: vi.fn(),
        notifyUnsavedContent: vi.fn(),
        notifyViewportLine: vi.fn(),
        ...overrides,
    } as PersistenceDeps & {
        notifyUnsavedContent: ReturnType<typeof vi.fn>;
        notifyViewportLine: ReturnType<typeof vi.fn>;
        setState: ReturnType<typeof vi.fn>;
        getState: ReturnType<typeof vi.fn>;
    };
    return { persistence: initSessionPersistence(deps), deps };
}

function setFakeTimers(): void {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("未落盘内容推送", () => {
    it("文档变更后 应该 在 400ms 空闲后推送一次最新内容", () => {
        setFakeTimers();
        const { persistence, deps } = createPersistence();

        persistence.markUnsavedChanges();
        persistence.markUnsavedChanges(); // 防抖：连续的变更合并为一次
        vi.advanceTimersByTime(399);
        expect(deps.notifyUnsavedContent).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(deps.notifyUnsavedContent).toHaveBeenCalledTimes(1);
        expect(deps.notifyUnsavedContent).toHaveBeenCalledWith("# draft\n");
    });

    it("blur 应该在防抖前立即 flush（关闭标签前最后机会）", () => {
        setFakeTimers();
        const { persistence, deps } = createPersistence();
        persistence.markUnsavedChanges();

        window.dispatchEvent(new Event("blur"));
        expect(deps.notifyUnsavedContent).toHaveBeenCalledTimes(1);
    });

    it("pagehide 也应该 立即 flush", () => {
        setFakeTimers();
        const { persistence, deps } = createPersistence();
        persistence.markUnsavedChanges();
        window.dispatchEvent(new Event("pagehide"));
        expect(deps.notifyUnsavedContent).toHaveBeenCalledTimes(1);
    });

    it("标签页切到后台（visibilitychange=hidden） 应该 立即 flush", () => {
        setFakeTimers();
        const { persistence, deps } = createPersistence();
        persistence.markUnsavedChanges();
        const original = document.visibilityState;
        Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
        try {
            document.dispatchEvent(new Event("visibilitychange"));
        } finally {
            Object.defineProperty(document, "visibilityState", { value: original, configurable: true });
        }
        expect(deps.notifyUnsavedContent).toHaveBeenCalledTimes(1);
    });

    it("requestContent 清脏后 blur 不应该 立即 flush", () => {
        setFakeTimers();
        const { persistence, deps } = createPersistence();
        persistence.markUnsavedChanges();
        persistence.clearUnsavedChanges();

        window.dispatchEvent(new Event("blur"));
        expect(deps.notifyUnsavedContent).not.toHaveBeenCalled();
    });

    it("cancelPendingPush 应该 撤掉待触发的推送（重建前释放文档级 timer）", () => {
        setFakeTimers();
        const { persistence, deps } = createPersistence();
        persistence.markUnsavedChanges();
        persistence.cancelPendingPush();

        vi.advanceTimersByTime(1000);
        expect(deps.notifyUnsavedContent).not.toHaveBeenCalled();
    });
});

describe("滚动位置持久化", () => {
    it("滚动后 应该 在 200ms 防抖后写 scrollY 并上报可见行", () => {
        setFakeTimers();
        const { deps } = createPersistence();
        window.dispatchEvent(new Event("scroll"));

        expect(deps.setState).not.toHaveBeenCalled();
        vi.advanceTimersByTime(199);
        expect(deps.setState).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(deps.setState).toHaveBeenCalledTimes(1);
        expect(deps.setState).toHaveBeenCalledWith({ scrollY: window.scrollY });
        expect(deps.notifyViewportLine).toHaveBeenCalledWith(1);
    });

    it("未创建编辑器时 应该 仍保存 scrollY，但不上报可见行", () => {
        setFakeTimers();
        const { deps } = createPersistence({ getView: () => null });
        window.dispatchEvent(new Event("scroll"));
        vi.advanceTimersByTime(200);
        expect(deps.setState).toHaveBeenCalledTimes(1);
        expect(deps.notifyViewportLine).not.toHaveBeenCalled();
    });
});

describe("选区持久化", () => {
    it("selectionchange 后 应该 在 300ms 防抖后写入 TextSelection 范围", () => {
        setFakeTimers();
        const { deps } = createPersistence({ getView: () => viewWithSelection(2, 5) });
        document.dispatchEvent(new Event("selectionchange"));

        expect(deps.setState).not.toHaveBeenCalled();
        vi.advanceTimersByTime(299);
        expect(deps.setState).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);

        expect(deps.setState).toHaveBeenCalledTimes(1);
        expect(deps.setState.mock.calls[0][0]).toMatchObject({ selection: { from: 2, to: 5 } });
    });

    it("saveSelectionNow 对于非 TextSelection（NodeSelection 等） 应该 不写入", () => {
        const { persistence, deps } = createPersistence({
            getView: () => ({ state: { selection: { from: 1, to: 1 } } } as unknown as EditorView),
        });
        persistence.saveSelectionNow();
        expect(deps.setState).not.toHaveBeenCalled();
    });

    it("readSavedSelection 应该 解析合法选区、非法数据返回 null", () => {
        const { persistence } = createPersistence({
            getState: () => ({ selection: { from: 4, to: 2 } }),
        });
        expect(persistence.readSavedSelection()).toEqual({ from: 2, to: 4 });

        const invalid = createPersistence({ getState: () => ({ selection: "bad" }) }).persistence;
        expect(invalid.readSavedSelection()).toBeNull();

        const empty = createPersistence().persistence;
        expect(empty.readSavedSelection()).toBeNull();
    });
});
