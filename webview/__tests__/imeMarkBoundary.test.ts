/**
 * IME composition at the end of an inline mark (2026-11-01 hand-test).
 *
 * Regression: clicking just past **bold** or pressing End resolves the DOM caret to the
 * end of the strong text. Typing a full-width colon through the IME then joined the bold
 * mark and the caret stayed inside the span. The composition-start guard clears the
 * stored marks when the caret is at the end of (or outside) the mark, so the composed
 * text is plain; inside the mark the formatting is kept.
 *
 * jsdom has no layout, so the DOM side of the selection is represented by a small fake
 * strong element; what matters is the plugin's decision (at end/outside vs inside).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextSelection } from "@milkdown/kit/prose/state";
import { createEditor, destroyEditor, getEditorView } from "../editor";

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
    };
}
// jsdom has no layout; the virtual cursor reads client rects for the fake caret range.
if (typeof Range.prototype.getClientRects !== "function") {
    Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
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

async function openEditor(markdown: string): Promise<void> {
    const root = document.createElement("div");
    document.body.appendChild(root);
    await createEditor(root, markdown, () => { /* noop */ });
    for (let attempt = 0; attempt < 100; attempt++) {
        if (document.querySelector(".milkdown .ProseMirror")) { return; }
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("editor was not mounted");
}

/** PM range of the strong text (positions), plus its text content. */
function strongRange(): { from: number; to: number; text: string } {
    const view = getEditorView();
    if (!view) { throw new Error("view missing"); }
    let from = 0;
    let text = "";
    view.state.doc.descendants((node, offset) => {
        if (node.isText && node.marks.some((mark) => mark.type.name === "strong")) {
            from = offset;
            text = node.text ?? "";
        }
    });
    if (!text) { throw new Error("strong text missing"); }
    return { from, to: from + text.length, text };
}

/** Put PM selection at `pos`; fake a DOM caret inside a detached <strong>. */
function putCaret(pos: number, text: string, offset: number): void {
    const view = getEditorView();
    if (!view) { throw new Error("view missing"); }
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)));

    const mark = document.createElement("strong");
    const textNode = document.createTextNode(text);
    mark.appendChild(textNode);
    document.body.appendChild(mark);
    const fakeRange = document.createRange();
    fakeRange.selectNodeContents(textNode);
    fakeRange.setStart(textNode, offset);
    fakeRange.collapse(true);
    vi.spyOn(window, "getSelection").mockReturnValue({
        anchorNode: textNode,
        anchorOffset: offset,
        focusNode: textNode,
        focusOffset: offset,
        rangeCount: 1,
        isCollapsed: true,
        getRangeAt: () => fakeRange,
    } as unknown as Selection);
}

function compositionStart(): void {
    const view = getEditorView();
    if (!view) { throw new Error("view missing"); }
    view.dom.dispatchEvent(new Event("compositionstart", { bubbles: true }));
}

afterEach(() => {
    destroyEditor();
    document.body.innerHTML = "";
    vi.restoreAllMocks();
});

describe("IME composition at the end of an inline mark", () => {
    it("在粗体末尾开始组合 应该 清空 storedMarks（冒号不再进入粗体）", async () => {
        await openEditor("**粗体**\n");
        const range = strongRange();
        const view = getEditorView();
        if (!view) { throw new Error("view missing"); }
        putCaret(range.to, range.text, range.text.length);
        expect(view.state.storedMarks).toBeNull();

        compositionStart();

        expect(Array.isArray(view.state.storedMarks)).toBe(true);
        expect(view.state.storedMarks).toHaveLength(0);
    });

    it("在粗体中间开始组合 应该 保留 storedMarks / 格式（不会被误清）", async () => {
        await openEditor("**粗体文字**\n");
        const range = strongRange();
        const view = getEditorView();
        if (!view) { throw new Error("view missing"); }
        putCaret(range.from + 1, range.text, 1);

        compositionStart();

        expect(view.state.storedMarks).toBeNull();
    });
});
