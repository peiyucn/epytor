
import { afterEach, describe, expect, it } from "vitest";
import { CrepeBuilder } from "@milkdown/crepe";
import { editorViewCtx } from "@milkdown/kit/core";
import { inlineCodeSchema } from "@milkdown/kit/preset/commonmark";
import { TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import type { EditorView } from "@milkdown/kit/prose/view";
import { createVirtualCursor } from "../vendor/prosemirrorVirtualCursor";

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

async function makeEditor(md: string) {
    const root = document.createElement("div");
    document.body.appendChild(root);
    const crepe = new CrepeBuilder({ root, defaultValue: md });
    crepe.editor.use(
        inlineCodeSchema.extendSchema((prev) => (ctx) => ({ ...prev(ctx), inclusive: true })),
    );
    crepe.editor.use($prose(() => createVirtualCursor()));
    const editor = await crepe.create();
    return editor;
}

function getView(editor: Awaited<ReturnType<typeof makeEditor>>): EditorView {
    return editor.action((ctx) => ctx.get(editorViewCtx));
}

function pressKey(view: EditorView, key: string): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(event);
    return event;
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("行内代码行尾方向键（vendor 虚拟光标）", () => {
    it("行尾按 ArrowRight 应该 不移动光标但清空 storedMarks，输入为普通文本（回归：与有后续内容行为一致）", async () => {
        const editor = await makeEditor("para `code`\n");
        const view = getView(editor);
        let codeEnd = -1;
        view.state.doc.descendants((node, pos) => {
            if (node.text === "code") codeEnd = pos + node.nodeSize;
        });
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, codeEnd)));
        const posBefore = view.state.selection.from;

        pressKey(view, "ArrowRight");


        expect(view.state.selection.from).toBe(posBefore);

        view.dispatch(view.state.tr.insertText("x"));
        const codeTexts: string[] = [];
        view.state.doc.descendants((node) => {
            if (node.marks.some((m) => m.type.name === "inlineCode")) codeTexts.push(node.text ?? "");
        });
        expect(codeTexts.some((t) => t.includes("x"))).toBe(false);
    });

    it("代码中间按 ArrowRight 应该 放行（仍在代码内移动）", async () => {
        const editor = await makeEditor("para `codex`\n");
        const view = getView(editor);
        let codePos = -1;
        view.state.doc.descendants((node, pos) => {
            if (node.text === "codex") codePos = pos + 2;
        });
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, codePos)));

        const event = pressKey(view, "ArrowRight");

        expect(event.defaultPrevented).toBe(false);
    });

    it("普通文本（无 mark）尾部按 ArrowRight 应该 走上游文本边界行为（回归：不误触我们的行尾分支）", async () => {
        const editor = await makeEditor("para\n");
        const view = getView(editor);

        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)));

        pressKey(view, "ArrowRight");


        expect(view.state.selection.from).toBe(5);
    });
});
