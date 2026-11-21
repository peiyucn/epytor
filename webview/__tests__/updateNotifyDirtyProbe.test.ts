
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockVscodeApi } from "./setup";
import { createEditor } from "../editor";
import { editorViewCtx } from "@milkdown/kit/core";
import { TextSelection } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {  } unobserve() {  } disconnect() {  }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() {  }, removeListener() {  },
        addEventListener() {  }, removeEventListener() {  },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}

afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

describe("updateNotifyPlugin 首帧脏标记", () => {
    it("settle 后仅选区事务（点击定位光标）应该 不发 markDirty（回归：未编辑出现 ● 圆点）", async () => {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const onDocumentChanged = vi.fn();
        const editor = await createEditor(root, "hello world", onDocumentChanged);

        root.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        const view: EditorView = editor.action((ctx) => ctx.get(editorViewCtx));

        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
        expect(view.state.selection.from).toBe(2);

        expect(onDocumentChanged).not.toHaveBeenCalled();
        const dirtyCalls = mockVscodeApi.postMessage.mock.calls.filter(
            (call) => (call[0] as { type: string }).type === "markDirty",
        );
        expect(dirtyCalls).toHaveLength(0);
    }, 20000);
});
