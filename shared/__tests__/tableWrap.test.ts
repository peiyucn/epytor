import { describe, expect, it } from "vitest";
import { normalizeTableWrapMode, resolveTableWrapVars } from "../tableWrap";

describe("normalizeTableWrapMode（跨边界取值收窄）", () => {
    it("合法值 wrap / nowrap 应该 原样返回", () => {
        expect(normalizeTableWrapMode("wrap")).toBe("wrap");
        expect(normalizeTableWrapMode("nowrap")).toBe("nowrap");
    });

    it("旧值 none 应该 归一为 nowrap（与 resolveTableWrapVars 的迁移口径一致）", () => {
        expect(normalizeTableWrapMode("none")).toBe("nowrap");
    });

    it("未知字符串 / 非字符串 应该 回退 wrap", () => {
        expect(normalizeTableWrapMode("aggressive")).toBe("wrap");
        expect(normalizeTableWrapMode("")).toBe("wrap");
        expect(normalizeTableWrapMode(undefined)).toBe("wrap");
        expect(normalizeTableWrapMode(42)).toBe("wrap");
        expect(normalizeTableWrapMode(null)).toBe("wrap");
    });

    it("归一后的值 应该 与 resolveTableWrapVars 解析结果一致", () => {
        expect(resolveTableWrapVars(normalizeTableWrapMode("none")))
            .toEqual(resolveTableWrapVars("nowrap"));
        expect(resolveTableWrapVars(normalizeTableWrapMode("weird")))
            .toEqual(resolveTableWrapVars("wrap"));
    });
});

describe("resolveTableWrapVars（两档）", () => {
    it("wrap 档 应该 break-all 任意字符断行", () => {
        expect(resolveTableWrapVars("wrap")).toEqual({
            wordBreak: "break-all",
            whiteSpace: "normal",
            overflowX: "visible",
            tableWidth: "auto",
        });
    });

    it("nowrap 档 应该 nowrap + 横向滚动 + table max-content", () => {
        expect(resolveTableWrapVars("nowrap")).toEqual({
            wordBreak: "keep-all",
            whiteSpace: "nowrap",
            overflowX: "auto",
            tableWidth: "max-content",
        });
    });

    it("旧档位迁移：aggressive / normal / 未知值 应该 落到 wrap", () => {
        expect(resolveTableWrapVars("aggressive")).toEqual(resolveTableWrapVars("wrap"));
        expect(resolveTableWrapVars("normal")).toEqual(resolveTableWrapVars("wrap"));
        expect(resolveTableWrapVars("")).toEqual(resolveTableWrapVars("wrap"));
        expect(resolveTableWrapVars("weird")).toEqual(resolveTableWrapVars("wrap"));
    });

    it("旧档位迁移：none 应该 落到 nowrap", () => {
        expect(resolveTableWrapVars("none")).toEqual(resolveTableWrapVars("nowrap"));
    });
});
