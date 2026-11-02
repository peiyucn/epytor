import { describe, expect, it } from "vitest";
import { parseSavedSelection } from "../app/editorStatePersistence";

describe("parseSavedSelection 持久化光标位置的解析", () => {
    it("合法选区 应该 原样返回", () => {
        expect(parseSavedSelection({ from: 3, to: 7 })).toEqual({ from: 3, to: 7 });
        expect(parseSavedSelection({ from: 5, to: 5 })).toEqual({ from: 5, to: 5 });
        expect(parseSavedSelection({ from: 0, to: 0 })).toEqual({ from: 0, to: 0 });
    });

    it("反向选区（from > to） 应该 归一化为 from <= to", () => {
        expect(parseSavedSelection({ from: 9, to: 2 })).toEqual({ from: 2, to: 9 });
    });

    it("字段缺失或类型不对 应该 返回 null（按无存档处理）", () => {
        expect(parseSavedSelection(null)).toBeNull();
        expect(parseSavedSelection(undefined)).toBeNull();
        expect(parseSavedSelection(12)).toBeNull();
        expect(parseSavedSelection("3:7")).toBeNull();
        expect(parseSavedSelection({})).toBeNull();
        expect(parseSavedSelection({ from: 3 })).toBeNull();
        expect(parseSavedSelection({ from: "3", to: 7 })).toBeNull();
        expect(parseSavedSelection({ from: 3, to: null })).toBeNull();
    });

    it("非整数或负数 应该 返回 null（防止垃圾数据把光标设到非法位置）", () => {
        expect(parseSavedSelection({ from: 1.5, to: 2 })).toBeNull();
        expect(parseSavedSelection({ from: -1, to: 2 })).toBeNull();
        expect(parseSavedSelection({ from: 0, to: Number.NaN })).toBeNull();
        expect(parseSavedSelection({ from: 0, to: Number.POSITIVE_INFINITY })).toBeNull();
    });
});
