/**
 * 保存基线契约（F3 竞态的结构性防线）。
 *
 * 实测背景：在真实产物上用 headless Edge 扫过 0/1/5/15/40/80/150ms 七个时间点在「revert 重建
 * 期间请求保存」，**都没有复现**回旧内容。既然复现不到，就不引入「等待重建完成」这类会拖慢
 * 保存的改动，改为从构造上消除可能性：revert 时磁盘内容已知，在重建开始前就把它设为保存基线
 * （同时也是最小差异的比对基准）。
 *
 * 下面的用例锁住该契约：无编辑器时 `getMarkdownForSave()` 返回的就是最后一次采纳的基线。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { adoptDiskContentAsBaseline, destroyEditor, getMarkdownForSave } from "../editor";

describe("保存基线（无编辑器时）", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        destroyEditor();
    });

    it("采纳磁盘内容后 应该 直接作为保存结果返回（不序列化、不返回上一份）", () => {
        adoptDiskContentAsBaseline("# Document A\n");
        expect(getMarkdownForSave()).toBe("# Document A\n");
    });

    it("再次采纳 应该 覆盖旧基线（重建中重复保存不会写回更早的内容）", () => {
        adoptDiskContentAsBaseline("# Document A\n");
        adoptDiskContentAsBaseline("# Document B\n");
        expect(getMarkdownForSave()).toBe("# Document B\n");
    });

    it("空内容也照原样返回（不因空字符串退化成上一份）", () => {
        adoptDiskContentAsBaseline("# Document A\n");
        adoptDiskContentAsBaseline("");
        expect(getMarkdownForSave()).toBe("");
    });
});
