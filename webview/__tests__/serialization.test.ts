/**
 * 保存前序列化管线（覆盖 editor/serialization.ts）。
 * 拆分自 editor.ts 的 prepareMarkdownForSave（audit F2）；用例锁住行尾保持、
 * 最小差异、表格 `<br>` 风格与 `\&` 清理，保证纯函数化后行为不变。
 */
import { describe, expect, it } from "vitest";
import { prepareMarkdownForSave } from "../editor/serialization";

describe("prepareMarkdownForSave 保存前归一化", () => {
    it("CRLF 文件未编辑保存 应该 逐字保持原行尾（不把所有行改写一次）", () => {
        const source = "# 标题\r\n\r\n正文\r\n";
        expect(prepareMarkdownForSave({
            source,
            serialized: "# 标题\n\n正文\n",
            mode: "clean",
        })).toBe(source);
    });

    it("LF 文件 应该 保持 LF，不引入 CRLF", () => {
        const source = "- a\n- b\n";
        expect(prepareMarkdownForSave({
            source,
            serialized: "- a\n- b\n",
            mode: "clean",
        })).toBe(source);
    });

    it("编辑后 应该 只替换改动行，未改动行沿用源文件写法（最小差异）", () => {
        // 未改动的 `- a` 保留源文件标记；新写的 `* b!` 用序列化器输出（`*`）替换。
        const source = "- a\n- b\n";
        const serialized = "* a\n* b!\n";
        expect(prepareMarkdownForSave({ source, serialized, mode: "clean" })).toBe("- a\n* b!\n");
    });

    it("clean 模式 应该 还原源文件的表格 <br /> 写法", () => {
        const source = "| a | b |\n| --- | --- |\n| x<br />y | z |\n";
        // 序列化器按 GFM 写 `<br>`；clean 模式把它改回源文件的 `<br />`。
        const serialized = "| a | b |\n| --- | --- |\n| x<br>y | z |\n";
        expect(prepareMarkdownForSave({ source, serialized, mode: "clean" })).toBe(source);
    });

    it("compatible 模式 应该 保留序列化器输出（不做表格 <br> 风格还原）", () => {
        const source = "| a | b |\n| --- | --- |\n| x<br />y | z |\n";
        const serialized = "| a | b |\n| --- | --- |\n| x<br>y | z |\n";
        const result = prepareMarkdownForSave({ source, serialized, mode: "compatible" });
        expect(result).toContain("<br>");
        expect(result).not.toContain("<br />");
    });

    it("冗余的 \\& 转义 应该 在保存前去掉（链接 query 不被改写）", () => {
        const source = "[x](https://example.com/?a=1&b=2)\n";
        const serialized = "[x](https://example.com/?a=1\\&b=2)\n";
        expect(prepareMarkdownForSave({ source, serialized, mode: "clean" })).toBe(source);
    });

    it("空列表项的 <br /> 占位 应该 被剥离，但保留列表标记", () => {
        expect(prepareMarkdownForSave({
            source: "- \n",
            serialized: "- <br />\n",
            mode: "clean",
        })).toBe("- \n");
    });
});
