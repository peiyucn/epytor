import { describe, expect, it } from "vitest";
import { applyMinimalChanges } from "../markdown/minimalDiff";

describe("minimalDiff", () => {
    it("单行编辑应该保留未修改行的原始源码", () => {
        const saved = "keep-a\n  original spacing  \nkeep-b";
        const serialized = "keep-a\nchanged\nkeep-b";

        expect(applyMinimalChanges(saved, serialized)).toBe(
            "keep-a\nchanged\nkeep-b",
        );
    });

    it("插入内容时应该复用前后未修改行", () => {
        const saved = "before\noriginal\nafter";
        const serialized = "before\ninserted\noriginal\nafter";

        expect(applyMinimalChanges(saved, serialized)).toBe(
            "before\ninserted\noriginal\nafter",
        );
    });

    it("重复行发生插入时应该在小范围内稳定匹配", () => {
        const saved = "before\nduplicate\nduplicate\nafter";
        const serialized = "before\nduplicate\ninserted\nduplicate\nafter";

        expect(applyMinimalChanges(saved, serialized)).toBe(serialized);
    });

    it("表格格式变化时应该保留原始行风格", () => {
        const saved = "| Field | Type |\n| --- | --- |\n| id | bigint |";
        const serialized = "| Field | Type |\n|---|---|\n| id | bigint |";

        expect(applyMinimalChanges(saved, serialized)).toBe(saved);
    });

    it("列表标记符与嵌套缩进宽度变化时应该保留原始行风格", () => {

        const saved = "- one\n- two\n1. a\n    1. b\n        1. c";
        const serialized = "* one\n* two\n1. a\n   1. b\n      1. c";

        expect(applyMinimalChanges(saved, serialized)).toBe(saved);
    });

    it("列表行内容真的变了时应该采用新内容（写法归一只针对未改行）", () => {
        const saved = "- one\n- two";
        const serialized = "* one\n* two changed";

        expect(applyMinimalChanges(saved, serialized)).toBe("- one\n* two changed");
    });

    it("列表缩进层级真的变了时应该采用新缩进", () => {

        const saved = "- a\n- b";
        const serialized = "- a\n  - b";

        expect(applyMinimalChanges(saved, serialized)).toBe("- a\n  - b");
    });

    it("父项与子列表之间有空行时 嵌套项提升为同级 应该 采用新缩进（回归：层级被写回旧值）", () => {





        const saved = "- [ ] P\n\n  - [ ] C1\n  - [ ] C2\n  - [ ] C3";
        const serialized = "- [ ] P\n  - [ ] C1\n- [ ] C2\n  - [ ] C3";

        expect(applyMinimalChanges(saved, serialized)).toBe(serialized);
    });

    it("父项与子列表之间有空行时 未改动的嵌套项 应该 保留原文缩进宽度", () => {




        const saved = "- P\n    - C1\n    - C2";
        const serialized = "- P\n  - C1\n  - C2";

        expect(applyMinimalChanges(saved, serialized)).toBe(saved);
    });

    it("缩进用 tab 而序列化用空格 但层级相同 应该 保留原文", () => {
        const saved = "- P\n\t- C1\n\t- C2";
        const serialized = "- P\n  - C1\n  - C2";

        expect(applyMinimalChanges(saved, serialized)).toBe(saved);
    });

    it("有序列表的编号是内容 不应该被当成写法差异", () => {
        const saved = "1. one\n5. two";
        const serialized = "1. one\n2. two";

        expect(applyMinimalChanges(saved, serialized)).toBe("1. one\n2. two");
    });

    it("大范围重复内容无法安全匹配时应该快速使用新输出", () => {
        const saved = Array.from({ length: 500 }, () => "same").join("\n");
        const serialized = Array.from({ length: 500 }, () => "changed").join("\n");

        expect(applyMinimalChanges(saved, serialized)).toBe(serialized);
    });

    it("一万行文档只改一行时不应该执行超大规模全文 LCS", () => {
        const lineCount = 10_000;
        const lines = Array.from({ length: lineCount }, (_, index) => `paragraph ${index}`);
        const saved = lines.join("\n");
        lines[lineCount / 2] = `paragraph ${lineCount / 2} changed`;
        const serialized = lines.join("\n");




        applyMinimalChanges(saved, serialized);
        let best = Number.POSITIVE_INFINITY;
        for (let round = 0; round < 3; round++) {
            const start = performance.now();
            const output = applyMinimalChanges(saved, serialized);
            best = Math.min(best, performance.now() - start);
            expect(output).toContain(`paragraph ${lineCount / 2} changed`);
        }
        expect(best).toBeLessThan(3_000);
    });
});

