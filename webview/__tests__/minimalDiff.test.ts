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
        // 回归：mdast 固定输出 `*` 与 3 空格缩进，此前保存会把用户的 `-` / 4 空格嵌套改写
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
        // `- b` 从同级变成 `- a` 的子项：段内缩进档位从 1 档变 2 档 → 不能当成写法差异
        const saved = "- a\n- b";
        const serialized = "- a\n  - b";

        expect(applyMinimalChanges(saved, serialized)).toBe("- a\n  - b");
    });

    it("父项与子列表之间有空行时 嵌套项提升为同级 应该 采用新缩进（回归：层级被写回旧值）", () => {
        // 手测反馈 2026-10-26：任务列表中间某项退格提升后「下面的层级跟着带乱」。
        // 旧实现按「连续列表行段」取缩进档位：源文件里父项与子列表之间有空行，段在空行处
        // 断开，子项各自独占一段、档位一律算 0；序列化结果没有空行、是完整一段，父项 0 档、
        // 子项 1 档 —— 两边档位基准不同，提升后的 C2（0 档）反而与源文件里的 C2（0 档）签名
        // 相同，于是整行沿用旧文本，刚做的层级提升被静默写回。
        const saved = "- [ ] P\n\n  - [ ] C1\n  - [ ] C2\n  - [ ] C3";
        const serialized = "- [ ] P\n  - [ ] C1\n- [ ] C2\n  - [ ] C3";

        expect(applyMinimalChanges(saved, serialized)).toBe(serialized);
    });

    it("父项与子列表之间有空行时 未改动的嵌套项 应该 保留原文缩进宽度", () => {
        // 同一条回归的另一面：真正的写法差异（4 空格 vs 2 空格）仍要被保留，不能因为
        // 换用「文档级缩进单位」就把用户的手写缩进整段改写。
        // 注：这里刻意不放空行——「源文件有空行、序列化没有」属于空行口径的既有差异
        // （签名行集合规模不同即走重建），不在本用例范围内。
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

        // 挂钟断言对机器负载与覆盖率插桩敏感（测覆盖率时单轮会翻数倍）：改为「多轮取最小值 + 宽松上限」。
        // 实测（Node 24，1 万行改一行）：现实现约 30ms；去掉锚点与上限（= 全文 LCS）约 4s，相差约 120 倍，
        // 真回归仍会被抓住。
        applyMinimalChanges(saved, serialized); // 预热（首次调用含 JIT）
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

