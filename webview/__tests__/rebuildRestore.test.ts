import { describe, expect, it } from "vitest";
import { planRebuildRestore, type RebuildRestoreInput } from "../app/rebuildRestore";

const input = (overrides: Partial<RebuildRestoreInput>): RebuildRestoreInput => ({
    hadEditorFocus: true,
    isActivePanel: true,
    previousSelection: { from: 3, to: 3 },
    docUnchanged: true,
    docSize: 10,
    previousScrollY: 120,
    ...overrides,
});

describe("planRebuildRestore 编辑器重建后的连续性恢复计划", () => {
    it("重建前编辑器有焦点 + 面板激活 应该 恢复焦点、精确选区与滚动", () => {
        const plan = planRebuildRestore(input({
            previousSelection: { from: 4, to: 7 },
        }));
        expect(plan.restoreFocus).toBe(true);
        expect(plan.selection).toEqual({ from: 4, to: 7 });
        expect(plan.scrollY).toBe(120);
    });

    it("重建前没有焦点 应该 不夺回焦点，但仍恢复选区与滚动（回归：切回时光标回到 1 行 1 列）", () => {
        const plan = planRebuildRestore(input({
            hadEditorFocus: false,
            previousSelection: { from: 6, to: 6 },
        }));
        expect(plan.restoreFocus).toBe(false);
        expect(plan.selection).toEqual({ from: 6, to: 6 });
        expect(plan.scrollY).toBe(120);
    });

    it("面板未激活（后台 webview） 应该 不抢焦点，但仍恢复选区", () => {
        const plan = planRebuildRestore(input({ isActivePanel: false }));
        expect(plan.restoreFocus).toBe(false);
        expect(plan.selection).toEqual({ from: 3, to: 3 });
        expect(plan.scrollY).toBe(120);
    });

    it("文档内容真的变了 应该 只把光标夹回原位置（不恢复整段选区）", () => {
        const plan = planRebuildRestore(input({
            previousSelection: { from: 4, to: 7 },
            docUnchanged: false,
        }));
        expect(plan.restoreFocus).toBe(true);
        expect(plan.selection).toEqual({ from: 4, to: 4 });
    });

    it("旧光标位置超出新文档范围 应该 夹紧到末尾", () => {
        const plan = planRebuildRestore(input({
            previousSelection: { from: 40, to: 50 },
            docUnchanged: false,
            docSize: 12,
        }));
        expect(plan.selection).toEqual({ from: 12, to: 12 });
    });

    it("非文本选区（previousSelection 为 null） 应该 只恢复焦点与滚动", () => {
        const plan = planRebuildRestore(input({ previousSelection: null }));
        expect(plan.restoreFocus).toBe(true);
        expect(plan.selection).toBeNull();
        expect(plan.scrollY).toBe(120);
    });

    it("文档没变但选区反向（from > to） 应该 归一化为 from <= to", () => {
        const plan = planRebuildRestore(input({
            previousSelection: { from: 7, to: 3 },
        }));
        expect(plan.selection).toEqual({ from: 3, to: 7 });
    });
});
