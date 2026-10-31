/**
 * 表格内点行内公式：为什么必须挂在 document 捕获阶段，以及纠正链路的行为契约。
 *
 * 历史：这组断言原来用 `readFileSync` 切 `cellClickFixPlugin.ts` 源码，验证「有没有写
 * addEventListener(..., true) / filterTransaction 里 pending 判断在前」——重构一改写法就假红，
 * 而真正的行为（点公式能否拿到 NodeSelection、Crepe 的 rAF 整格选择能否被纠正）反而没测。
 * 现在改成真实编辑器的行为断言：
 *
 * 1. prosemirror-view 的事件入口会先问 NodeView.stopEvent()：Crepe 的表格 NodeView 对
 *    th/td 内 mousedown 返回 true，于是 `handleDOMEvents.mousedown` **根本不会被调用**，
 *    修正必须挂在 document 捕获阶段。
 * 2. 捕获阶段记下 atom 位置并同步钉一次 NodeSelection，随后两帧再钉，防止被 Crepe 的
 *    rAF 整格选择覆盖。
 * 3. 即便钉选被覆盖，只要 pendingAtomClickPos 还在，filterTransaction 必须放行，
 *    appendTransaction 才有机会把选区纠正回公式（filterTransaction 丢弃的 transaction
 *    不会触发 appendTransaction）。
 *
 * 真机因果链的说明保留在 cellClickFixPlugin.ts 文件头；本文件只锁行为。
 */
import { describe, expect, it } from "vitest";

// jsdom 环境桩：行为层用例会真正创建编辑器
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() { /* noop */ }, removeListener() { /* noop */ },
        addEventListener() { /* noop */ }, removeEventListener() { /* noop */ },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
for (const name of ["ResizeObserver", "IntersectionObserver"]) {
    if (typeof (window as unknown as Record<string, unknown>)[name] === "undefined") {
        (window as unknown as Record<string, unknown>)[name] = class {
            observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
            takeRecords() { return []; }
        };
    }
}
(window as unknown as Record<string, unknown>).__i18n = {
    translations: {}, isMac: false, serializationMode: "clean",
};

// jsdom 不实现 document.elementFromPoint；Crepe 的 TableNodeView.stopEvent 在 mousedown 里
// 调用 prosemirror-view 的 posAtCoords，后者无条件调用它，缺桩会被 jsdom 记成未处理异常。
// 桩返回 null + 事件用视口外坐标，posAtCoords 会干净返回 null（见 clickMath）。
if (typeof document.elementFromPoint !== "function") {
    Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: (() => null) as unknown as typeof document.elementFromPoint,
    });
}

/**
 * 在公式 DOM 上派发一次「单击」mousedown。
 *
 * clientX/Y 故意给视口外坐标：jsdom 没有布局，视口内坐标会让 prosemirror-view 的
 * posAtCoords 用全 0 的 rect 推出一个非法位置（Position -1 out of range）；视口外坐标让它
 * 干净返回 null，Crepe 的 TableNodeView 据此放行事件，测试只依赖本插件的 target 判据。
 */
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

/** 两帧 rAF：让捕获阶段注册的「钉选区」全部跑完，避免销毁后仍有回调改状态 */
async function flushFrames(count = 2): Promise<void> {
    for (let i = 0; i < count; i++) {
        await new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); });
    }
}

interface MathEditorFixture {
    view: import("@milkdown/kit/prose/view").EditorView;
    mathPos: number;
    mathEl: HTMLElement;
    /** 公式所在 table_cell 的位置 */
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

            // 捕获阶段同步钉选：不等 rAF 就应该已经落在公式上
            expect(fixture.view.state.selection).toBeInstanceOf(NodeSelection);
            expect((fixture.view.state.selection as InstanceType<typeof NodeSelection>).from)
                .toBe(fixture.mathPos);

            // rAF 里的重复钉选不改变结果
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

            // 模拟 Crepe TableNodeView 在 mousedown 之后补发的「整格 NodeSelection」：
            // 在捕获阶段的钉选之后（bubble 阶段）同步派发，覆盖当前选区。
            const overrideSelection = (): void => {
                view.dispatch(
                    view.state.tr.setSelection(
                        NodeSelection.create(view.state.doc, fixture.cellPos + 1),
                    ),
                );
            };
            document.addEventListener("mousedown", overrideSelection, { once: true });

            clickMath(fixture);

            // 覆盖 transaction 未被 filterTransaction 丢弃（pending 放行），appendTransaction 又把它
            // 纠正回公式；最终选区必须是公式，而不是整格。
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
