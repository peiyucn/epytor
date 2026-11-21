import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView as CMEditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { CM_RECONFIGURE_DELAY_MS, observeCmEditorCount } from "../editor/cmThemeObserver";


function makeContainer(count: number): HTMLElement {
    const container = document.createElement("div");
    for (let i = 0; i < count; i++) {
        const cm = document.createElement("div");
        cm.className = "cm-editor";
        container.appendChild(cm);
    }
    document.body.appendChild(container);
    return container;
}


async function flushMutations(): Promise<void> {
    await new Promise<void>((resolve) => {
        queueMicrotask(resolve);
    });
}

describe("observeCmEditorCount", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("DOM 变更但 .cm-editor 数量不变时 应该 不触发补配（无限回环回归）", async () => {
        const container = makeContainer(1);
        const onChange = vi.fn();
        observeCmEditorCount(container, onChange);


        const cm = container.querySelector<HTMLElement>(".cm-editor")!;
        cm.appendChild(document.createElement("div"));
        cm.setAttribute("class", "cm-editor cm-focused");
        container.appendChild(document.createElement("div"));
        await flushMutations();
        vi.advanceTimersByTime(CM_RECONFIGURE_DELAY_MS * 5);

        expect(onChange).not.toHaveBeenCalled();
    });

    it("新增 .cm-editor 时 应该 延迟触发一次补配", async () => {
        const container = makeContainer(0);
        const onChange = vi.fn();
        observeCmEditorCount(container, onChange);

        const cm = document.createElement("div");
        cm.className = "cm-editor";
        container.appendChild(cm);
        await flushMutations();
        expect(onChange).not.toHaveBeenCalled();

        vi.advanceTimersByTime(CM_RECONFIGURE_DELAY_MS);

        expect(onChange).toHaveBeenCalledOnce();
    });

    it("移除 .cm-editor 时 应该 触发补配", async () => {
        const container = makeContainer(1);
        const onChange = vi.fn();
        observeCmEditorCount(container, onChange);

        container.querySelector(".cm-editor")!.remove();
        await flushMutations();
        vi.advanceTimersByTime(CM_RECONFIGURE_DELAY_MS);

        expect(onChange).toHaveBeenCalledOnce();
    });

    it("断开监听后新增 .cm-editor 时 应该 不再触发", async () => {
        const container = makeContainer(0);
        const onChange = vi.fn();
        const disconnect = observeCmEditorCount(container, onChange);
        disconnect();

        const cm = document.createElement("div");
        cm.className = "cm-editor";
        container.appendChild(cm);
        await flushMutations();
        vi.advanceTimersByTime(CM_RECONFIGURE_DELAY_MS);

        expect(onChange).not.toHaveBeenCalled();
    });

    it("真实 reconfigure 引起 childList 变更时 应该 不再次排入补配（无限回环回归）", async () => {


        vi.useRealTimers();
        const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
        const js = languages.find((l) => l.name === "JavaScript")!;
        const jsSupport = await js.load();
        const cmTheme = new Compartment();
        const container = document.createElement("div");
        document.body.appendChild(container);
        const view = new CMEditorView({
            state: EditorState.create({
                doc: "const a = 1;\nfunction f(x) { return x + a; }\n",
                extensions: [cmTheme.of(oneDark), jsSupport],
            }),
            parent: container,
        });
        const reconfigure = vi.fn(() => {
            view.dispatch({ effects: cmTheme.reconfigure(syntaxHighlighting(defaultHighlightStyle)) });
        });
        observeCmEditorCount(container, reconfigure);


        const newCm = document.createElement("div");
        newCm.className = "cm-editor";
        container.appendChild(newCm);
        await wait(CM_RECONFIGURE_DELAY_MS * 4);
        expect(reconfigure).toHaveBeenCalledOnce();


        await wait(CM_RECONFIGURE_DELAY_MS * 30);

        expect(reconfigure).toHaveBeenCalledOnce();
        view.destroy();
    }, 20000);
});
