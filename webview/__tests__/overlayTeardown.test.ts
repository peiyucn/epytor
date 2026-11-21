
import { beforeEach, describe, expect, it, vi } from "vitest";
import { closeImagePicker, showImagePicker } from "../components/imagePicker";
import { closeTableGridPicker } from "../components/tableGridPicker";

describe("浮层的重建清理入口", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
    });

    it("图片选择器：打开后 closeImagePicker 应该 移除浮层", () => {
        showImagePicker(
            async () => undefined,
            () => undefined,
            () => undefined,
            async () => null,
        );
        expect(document.querySelector(".epytor-img-picker-overlay")).not.toBeNull();

        closeImagePicker();
        expect(document.querySelector(".epytor-img-picker-overlay")).toBeNull();
    });

    it("图片选择器：没有任何浮层时调用 应该 不抛错（幂等）", () => {
        expect(() => { closeImagePicker(); closeImagePicker(); }).not.toThrow();
    });

    it("表格选择器：没有浮层时调用 应该 不抛错（幂等）", () => {
        expect(() => { closeTableGridPicker(); closeTableGridPicker(); }).not.toThrow();
    });
});
