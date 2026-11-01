/**
 * IME composition at the end of an inline mark (2026-11-01 hand-test).
 *
 * Regression: clicking just past **bold** or pressing End resolves the DOM caret to the
 * end of the strong text. Typing a full-width colon through the IME then joined the bold
 * mark and the caret stayed inside the span. The composition-start guard clears the
 * stored marks when the caret is at the end of (or outside) the mark, so the composed
 * text is plain; inside the mark the formatting is kept.
 */
import { afterEach, describe, expect, it } from "vitest";
import { TextSelection } from "@milkdown/kit/prose/state";
import { createEditor, destroyEditor, getEditorView } from "../editor";

// jsdom Range has no layout; the virtual cursor asks for client rects after our dispatch.
if (typeof Range.prototype.getClientRects !== "function") {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
if (typeof Range.prototype.getBoundingClientRect !== "function") {
    Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect);
}
if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() { /* noop */ }, removeListener() { /* noop */ },
        addEventListener() { /* noop */ }, removeEventListener() { /* noop */ },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
(window as unknown as Record<string, unknown>).__i18n = {
    translations: {},
    isMac: false,
    serializationMode: "clean",
};

async function openEditor(markdown: string): Promise<HTMLElement> {
    const root = document.createElement("div");
    document.body.appendChild(root);
    await createEditor(root, markdown, () => { /* noop */ });
    return root;
}

/** Put the ProseMirror and DOM selections at the end of the bold text. */
function caretAtEndOfBold(root: HTMLElement): void {
    const view = getEditorView();
    if (!view) { throw new Error("editor view missing"); }
    let pos = 0;
    view.state.doc.descendants((node, offset) => {
        if (node.isText && node.marks.some((mark) => mark.type.name === "strong")) {
            pos = offset + node.nodeSize;
        }
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));

    const strong = root.querySelector("strong");
    if (!strong) { throw new Error("strong not rendered"); }
    const range = document.createRange();
    range.selectNodeContents(strong);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    view.dom.focus();
}

function compositionStart(viewDom: HTMLElement): void {
    viewDom.dispatchEvent(new Event("compositionstart", { bubbles: true }));
}

afterEach(() => {
    destroyEditor();
    document.body.innerHTML = "";
});

describe("IME composition at the end of an inline mark", () => {
    it("在粗体末尾开始组合 应该 清空 storedMarks（冒号不再进入粗体）", async () => {
        const root = await openEditor("**粗体**\n");
        caretAtEndOfBold(root);
        const view = getEditorView();
        if (!view) { throw new Error("editor view missing"); }
        expect(view.state.storedMarks).toBeNull();

        compositionStart(view.dom);

        expect(Array.isArray(view.state.storedMarks)).toBe(true);
        expect(view.state.storedMarks).toHaveLength(0);
    });

    it("在粗体中间开始组合 应该 保留 storedMarks / 格式（不会被误清）", async () => {
        const root = await openEditor("**粗体文字**\n");
        const view = getEditorView();
        if (!view) { throw new Error("editor view missing"); }
        let inside = 0;
        view.state.doc.descendants((node, offset) => {
            if (node.isText && node.marks.some((mark) => mark.type.name === "strong")) {
                inside = offset + 1;
            }
        });
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, inside)));

        const strong = root.querySelector("strong");
        const text = strong?.firstChild;
        if (!strong || !text) { throw new Error("strong not rendered"); }
        const range = document.createRange();
        range.setStart(text, 1);
        range.collapse(true);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        view.dom.focus();

        compositionStart(view.dom);

        expect(view.state.storedMarks).toBeNull();
    });
});
