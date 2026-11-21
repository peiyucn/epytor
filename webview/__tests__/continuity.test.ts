
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EditorView } from "@milkdown/kit/prose/view";
import { captureContinuity, restoreContinuity } from "../editor/continuity";

interface FakeViewOptions {
    hasFocus?: boolean;
}

function fakeView(options: FakeViewOptions = {}): EditorView {
    const doc = {
        content: { size: 10 },
        eq: (other: unknown) => other === doc,
    };
    return {
        state: { selection: {}, doc },
        hasFocus: () => options.hasFocus ?? false,
        focus: vi.fn(),
        dispatch: vi.fn(),
    } as unknown as EditorView;
}

function setScrollY(value: number): void {
    Object.defineProperty(window, "scrollY", { value, configurable: true, writable: true });
}

describe("editor continuity 接线", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        setScrollY(0);
    });

    it("captureContinuity 应该 取焦点/文档/滚动快照，非文本选区记 null", () => {
        const view = fakeView({ hasFocus: true });
        setScrollY(321);
        const continuity = captureContinuity(view);
        expect(continuity).not.toBeNull();
        expect(continuity!.hadEditorFocus).toBe(true);
        expect(continuity!.previousSelection).toBeNull();
        expect(continuity!.previousDoc).toBe(view.state.doc);
        expect(continuity!.previousScrollY).toBe(321);
    });

    it("restoreContinuity：原来有焦点 + 面板激活 应该 恢复焦点与滚动", () => {
        const scrollTo = vi.fn();
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.spyOn(window, "scrollTo").mockImplementation(scrollTo);
        const view = fakeView();
        const restoreFocus = restoreContinuity(
            view,
            { hadEditorFocus: true, previousSelection: null, previousDoc: view.state.doc, previousScrollY: 88 },
            { isActivePanel: true },
        );
        expect(restoreFocus).toBe(true);
        expect(view.focus).toHaveBeenCalledTimes(1);
        expect(scrollTo).toHaveBeenCalledWith({ top: 88 });
    });

    it("restoreContinuity：面板不激活 应该 只恢复滚动、不抢焦点", () => {
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            callback(0);
            return 1;
        });
        vi.spyOn(window, "scrollTo").mockImplementation(() => {});
        const view = fakeView();
        const restoreFocus = restoreContinuity(
            view,
            { hadEditorFocus: true, previousSelection: null, previousDoc: view.state.doc, previousScrollY: 42 },
            { isActivePanel: false },
        );
        expect(restoreFocus).toBe(false);
        expect(view.focus).not.toHaveBeenCalled();
        expect(window.scrollTo).toHaveBeenCalledWith({ top: 42 });
    });
});
