/**
 * 编辑器实例与保存快照（覆盖 editor/editorSession.ts）。
 * 拆分自 editor.ts 的四个模块级 `let`（audit F2/F10）：用例锁住「无编辑器时返回基线」、
 * 模式切换作废旧 doc 快照、destroy 的清理顺序与幂等。
 */
import { describe, expect, it, vi } from "vitest";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import { createEditorSession, SavedSnapshot } from "../editor/editorSession";

/** 只满足 getMarkdownForSave 无编辑器分支所需的最小 Editor 形状（不进入真实序列化）。 */
function fakeEditorWithView(view: EditorView): Editor {
    return {
        action: (fn: (ctx: { get(key: unknown): unknown }) => unknown) =>
            fn({ get: (key: unknown) => (key === editorViewCtx ? view : undefined) }),
        destroy: vi.fn(),
    } as unknown as Editor;
}

describe("SavedSnapshot 保存基线对象", () => {
    it("adoptDiskContent 应该 只更新 markdown，不动 doc", () => {
        const snapshot = new SavedSnapshot();
        snapshot.seedDoc({} as never);
        snapshot.adoptDiskContent("# disk\n");
        expect(snapshot.markdown).toBe("# disk\n");
        expect(snapshot.doc).not.toBeNull();
    });

    it("invalidateDoc 之后 matches 应该 恒为 false（强制重新序列化）", () => {
        const doc = { eq: () => true } as never;
        const snapshot = new SavedSnapshot();
        snapshot.seedDoc(doc);
        expect(snapshot.matches(doc)).toBe(true);
        snapshot.invalidateDoc();
        expect(snapshot.matches(doc)).toBe(false);
    });

    it("recordSave 应该 同时记录 markdown 与 doc", () => {
        const snapshot = new SavedSnapshot();
        const doc = { eq: () => true } as never;
        snapshot.recordSave("# saved\n", doc);
        expect(snapshot.markdown).toBe("# saved\n");
        expect(snapshot.matches(doc)).toBe(true);
    });
});

describe("EditorSession 保存与生命周期", () => {
    it("无编辑器时 getMarkdownForSave 应该 返回最后记录的基线", () => {
        const session = createEditorSession();
        session.adoptDiskContentAsBaseline("# A\n");
        expect(session.getMarkdownForSave()).toBe("# A\n");
        session.adoptDiskContentAsBaseline("");
        expect(session.getMarkdownForSave()).toBe("");
    });

    it("doc 与快照相等时 应该 直接返回基线文本（未编辑保存逐字不变）", () => {
        const doc = { eq: (other: unknown) => other === doc } as never;
        const view = { state: { doc } } as unknown as EditorView;
        const session = createEditorSession();
        session.setEditor(fakeEditorWithView(view));
        session.snapshot.seedMarkdown("# keep\r\n");
        session.snapshot.seedDoc(doc);
        expect(session.getMarkdownForSave()).toBe("# keep\r\n");
        expect(session.getView()).toBe(view);
    });

    it("序列化模式变化 应该 作废 doc 快照（旧快照只对旧模式有效）", () => {
        const session = createEditorSession();
        session.snapshot.seedDoc({} as never);
        session.setSerializationMode("compatible");
        expect(session.getSerializationMode()).toBe("compatible");
        expect(session.getEditor()).toBeNull(); // 模式切换不应触碰编辑器实例
    });

    it("destroy 应该 按序释放主题订阅、CM observer 与编辑器，且幂等", () => {
        const session = createEditorSession();
        const order: string[] = [];
        const editor = {
            action: vi.fn(),
            destroy: vi.fn(() => { order.push("editor"); }),
        } as unknown as Editor;
        session.setEditor(editor);
        session.setThemeUnsubscribe(() => { order.push("theme"); });
        session.setCmObserverDisconnect(() => { order.push("cm"); });
        session.snapshot.seedMarkdown("# base\n");

        session.destroy();
        expect(order).toEqual(["theme", "cm", "editor"]);
        expect(session.getEditor()).toBeNull();
        // 与旧实现一致：destroy 不清空 markdown 基线，只作废 doc 快照（重建窗口保存仍安全）。
        expect(session.getMarkdownForSave()).toBe("# base\n");
        expect(session.snapshot.doc).toBeNull();

        expect(() => session.destroy()).not.toThrow();
        expect(order).toEqual(["theme", "cm", "editor"]); // 幂等：句柄已置空，不重复调用
    });

    it("重复设置 CM observer 应该 先断开上一个（避免重建泄漏 observer）", () => {
        const session = createEditorSession();
        const first = vi.fn();
        const second = vi.fn();
        session.setCmObserverDisconnect(first);
        session.setCmObserverDisconnect(second);
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).not.toHaveBeenCalled();
        session.destroy();
        expect(second).toHaveBeenCalledTimes(1);
    });
});
