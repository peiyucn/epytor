
import { describe, expect, it } from "vitest";

if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() {  }, removeListener() {  },
        addEventListener() {  }, removeEventListener() {  },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
for (const name of ["ResizeObserver", "IntersectionObserver"]) {
    if (typeof (window as unknown as Record<string, unknown>)[name] === "undefined") {
        (window as unknown as Record<string, unknown>)[name] = class {
            observe() {  } unobserve() {  } disconnect() {  }
            takeRecords() { return []; }
        };
    }
}
(window as unknown as Record<string, unknown>).__i18n = {
    translations: {}, isMac: false, serializationMode: "clean",
};

if (typeof document.elementFromPoint !== "function") {
    Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: (() => null) as unknown as typeof document.elementFromPoint,
    });
}

function clickMath(fixture: MathEditorFixture): void {
    fixture.mathEl.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: 1,
        clientX: -1000,
        clientY: -1000,
    }));
}

const TABLE_MD = "| 列A | 列B |\n| --- | --- |\n| $x$ 说明 | 普通 |\n";

async function flushFrames(count = 2): Promise<void> {
    for (let i = 0; i < count; i++) {
        await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
}

interface MathEditorFixture {
    view: import("@milkdown/kit/prose/view").EditorView;
    mathPos: number;
    mathEl: HTMLElement;

    cellPos: number;
    destroy: () => void;
}

async function makeMathTableEditor(): Promise<MathEditorFixture> {
    const { createEditor, destroyEditor } = await import("../editor");
    const { editorViewCtx } = await import("@milkdown/kit/core");

    const root = document.createElement("div");
    document.body.appendChild(root);
    const editor = await createEditor(root, TABLE_MD, () => {});
    const view = editor.action((ctx) => ctx.get(editorViewCtx));

    let mathPos = -1;
    view.state.doc.descendants((node, pos) => {
        if (node.type.name === "math_inline") mathPos = pos;
    });
    let cellPos = -1;
    view.state.doc.descendants((node, pos) => {
        if (node.type.name === "table_cell" && pos < mathPos && mathPos < pos + node.nodeSize) {
            cellPos = pos;
        }
    });
    const mathEl = view.dom.querySelector<HTMLElement>('[data-type="math_inline"]');
    expect(mathPos, "文档里应有 math_inline").toBeGreaterThanOrEqual(0);
    expect(cellPos, "公式应位于 table_cell 内").toBeGreaterThanOrEqual(0);
    expect(mathEl, "math_inline 应有对应 DOM").not.toBeNull();

    return {
        view,
        mathPos,
        mathEl: mathEl!,
        cellPos,
        destroy: () => {
            destroyEditor();
            document.body.innerHTML = "";
        },
    };
}

describe("表格内公式选择：schema 与初始 NodeSelection", () => {
    it("math_inline 应该 仍是 atom:true（编辑气泡依赖 NodeSelection）", async () => {
        const fixture = await makeMathTableEditor();
        try {
            expect(fixture.view.state.schema.nodes["math_inline"].isAtom).toBe(true);
        } finally {
            await flushFrames();
            fixture.destroy();
        }
    }, 40000);

    it("真实表格里 应该 能对单元格内的公式建立 NodeSelection（且公式确在 cell 内）", async () => {
        const fixture = await makeMathTableEditor();
        try {
            const { NodeSelection } = await import("@milkdown/kit/prose/state");
            fixture.view.dispatch(
                fixture.view.state.tr.setSelection(
                    NodeSelection.create(fixture.view.state.doc, fixture.mathPos),
                ),
            );

            expect(fixture.view.state.selection).toBeInstanceOf(NodeSelection);
            expect((fixture.view.state.selection as InstanceType<typeof NodeSelection>).from)
                .toBe(fixture.mathPos);
        } finally {
            await flushFrames();
            fixture.destroy();
        }
    }, 40000);
});

describe("表格内公式点击（document 捕获阶段修正目标）", () => {
    it("在单元格里的公式上 mousedown 应该 把选区修正为公式的 NodeSelection", async () => {
        const fixture = await makeMathTableEditor();
        try {
            const { NodeSelection } = await import("@milkdown/kit/prose/state");

            clickMath(fixture);

            expect(fixture.view.state.selection).toBeInstanceOf(NodeSelection);
            expect((fixture.view.state.selection as InstanceType<typeof NodeSelection>).from)
                .toBe(fixture.mathPos);

            await flushFrames(3);
            expect(fixture.view.state.selection).toBeInstanceOf(NodeSelection);
            expect((fixture.view.state.selection as InstanceType<typeof NodeSelection>).from)
                .toBe(fixture.mathPos);
        } finally {
            await flushFrames();
            fixture.destroy();
        }
    }, 40000);

    it("Crepe 的 rAF 整格选择覆盖后 应该 由 appendTransaction 纠正回公式", async () => {
        const fixture = await makeMathTableEditor();
        try {
            const { NodeSelection } = await import("@milkdown/kit/prose/state");
            const { view } = fixture;

            const overrideSelection = (): void => {
                view.dispatch(
                    view.state.tr.setSelection(
                        NodeSelection.create(view.state.doc, fixture.cellPos + 1),
                    ),
                );
            };
            document.addEventListener("mousedown", overrideSelection, { once: true });

            clickMath(fixture);

            expect(view.state.selection).toBeInstanceOf(NodeSelection);
            expect((view.state.selection as InstanceType<typeof NodeSelection>).from)
                .toBe(fixture.mathPos);

            await flushFrames(3);
            expect(view.state.selection).toBeInstanceOf(NodeSelection);
            expect((view.state.selection as InstanceType<typeof NodeSelection>).from)
                .toBe(fixture.mathPos);
        } finally {
            await flushFrames();
            fixture.destroy();
        }
    }, 40000);
});
