/**
 * Typing at the boundary of an inline mark (2026-11-01 hand-test).
 *
 * Regression: clicking just past **bold** or pressing End resolves the DOM caret to the
 * end of the strong text. An IME-composed full-width colon then either joined the bold mark
 * or the caret ended one character past the inserted colon. The fix makes strong/emphasis/
 * strikethrough marks non-inclusive, so the boundary belongs outside the mark and the
 * composed punctuation is plain; typing inside the marked text keeps the mark.
 */
import { afterEach, describe, expect, it } from "vitest";
import { TextSelection } from "@milkdown/kit/prose/state";
import { createEditor, destroyEditor, getEditorView } from "../editor";

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

/** PM range of the strong text. */
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

function textNodes(): { text: string; marks: string[] }[] {
    const view = getEditorView();
    if (!view) { throw new Error("view missing"); }
    const out: { text: string; marks: string[] }[] = [];
    view.state.doc.descendants((node) => {
        if (node.isText && node.text) {
            out.push({ text: node.text, marks: node.marks.map((mark) => mark.type.name) });
        }
    });
    return out;
}

function insertAt(pos: number, text: string): void {
    const view = getEditorView();
    if (!view) { throw new Error("view missing"); }
    view.dispatch(
        view.state.tr
            .setSelection(TextSelection.create(view.state.doc, pos))
            .insertText(text),
    );
}

afterEach(() => {
    destroyEditor();
    document.body.innerHTML = "";
});

describe("行内格式边界输入（2026-11-01 手测）", () => {
    it("strong / emphasis / strikethrough 应该 都是非 inclusive（边界在格式外）", async () => {
        await openEditor("**粗体**\n");
        const schema = getEditorView()?.state.schema;
        if (!schema) { throw new Error("schema missing"); }
        expect(schema.marks.strong.spec.inclusive).toBe(false);
        expect(schema.marks.emphasis.spec.inclusive).toBe(false);
        expect(schema.marks.strike_through.spec.inclusive).toBe(false);
    });

    it("在粗体末尾插入全角冒号 应该 不带粗体（光标不再被格式拖走）", async () => {
        await openEditor("**粗体**\n");
        const { to } = strongRange();

        insertAt(to, "：");

        const colon = textNodes().find((node) => node.text.includes("："));
        expect(colon, "colon was not inserted").toBeDefined();
        expect(colon!.marks).not.toContain("strong");
    });

    it("在粗体中间插入字符 应该 仍然带粗体（格式内输入不受影响）", async () => {
        await openEditor("**粗体文字**\n");
        const { from, text } = strongRange();

        insertAt(from + 1, "x");

        const inside = textNodes().find((node) => node.text.includes("x"));
        expect(inside, "character was not inserted").toBeDefined();
        expect(inside!.marks).toContain("strong");
        expect(inside!.text).toContain("粗");
        expect(text).toBe("粗体文字");
    });

    it("IME 组合结束后光标多跳一个字 应该 拉回到组合文本末尾", async () => {
        // Chrome 在带格式边界做 IME 组合时可能把选区报后一位；录屏里冒号后光标落在
        // 下一个字「斯」后面。compositionend 之后用组合文本长度做兜底修正。
        await openEditor("**粗体**斯\n");
        const { to } = strongRange();
        const view = getEditorView();
        if (!view) { throw new Error("view missing"); }
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, to)));
        view.dom.dispatchEvent(new Event("compositionstart", { bubbles: true }));
        const update = new Event("compositionupdate", { bubbles: true });
        Object.defineProperty(update, "data", { value: "：" });
        view.dom.dispatchEvent(update);
        const end = new Event("compositionend", { bubbles: true });
        Object.defineProperty(end, "data", { value: "：" });
        view.dom.dispatchEvent(end);

        // Simulate the browser's post-composition transaction: colon inserted, caret one past.
        const tr = view.state.tr.insertText("：", to);
        tr.setSelection(TextSelection.create(tr.doc, to + 2));
        view.dispatch(tr);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(view.state.selection.empty).toBe(true);
        expect(view.state.selection.from).toBe(to + 1);
        expect(view.state.doc.textContent).toContain("：斯");
    });

    it("插入全角冒号的事务若把光标放到后一个字后面 应该 按事务步长拉回", async () => {
        await openEditor("**粗体**斯\n");
        const { to } = strongRange();
        const view = getEditorView();
        if (!view) { throw new Error("view missing"); }
        const tr = view.state.tr.insertText("：", to);
        tr.setSelection(TextSelection.create(tr.doc, to + 2));
        view.dispatch(tr);
        expect(view.state.selection.from).toBe(to + 1);
    });
});
