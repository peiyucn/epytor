
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
