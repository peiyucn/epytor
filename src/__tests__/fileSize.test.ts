import { describe, expect, it } from "vitest";
import { composeStatusBarText, formatFileSize } from "../utils/fileSize";

describe("formatFileSize 文件大小显示", () => {
    it("小于 1 KB 应该 显示整数 B", () => {
        expect(formatFileSize(0)).toBe("0 B");
        expect(formatFileSize(1)).toBe("1 B");
        expect(formatFileSize(980)).toBe("980 B");
        expect(formatFileSize(1023)).toBe("1023 B");
    });

    it("1 KB 起 应该 显示一位小数的 KB", () => {
        expect(formatFileSize(1024)).toBe("1.0 KB");
        expect(formatFileSize(1536)).toBe("1.5 KB");
        expect(formatFileSize(12595)).toBe("12.3 KB");
        // 整千也保留一位小数，避免状态栏宽度跳动
        expect(formatFileSize(8 * 1024)).toBe("8.0 KB");
    });

    it("1 MB 起 应该 显示一位小数的 MB", () => {
        expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
        expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
        expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2048.0 MB");
    });

    it("档位边界 应该 正确切换（1023 B → 1024 B → 1 MB）", () => {
        expect(formatFileSize(1023)).toBe("1023 B");
        expect(formatFileSize(1024)).toBe("1.0 KB");
        expect(formatFileSize(1024 * 1024 - 1)).toBe("1024.0 KB");
        expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    });

    it("未取到大小（undefined / null）应该 返回 null（调用方整段省略）", () => {
        expect(formatFileSize(undefined)).toBeNull();
        expect(formatFileSize(null)).toBeNull();
    });

    it("非法输入 应该 返回 null（不显示 0 B 或 ?，避免误会文件是空的）", () => {
        expect(formatFileSize(Number.NaN)).toBeNull();
        expect(formatFileSize(Number.POSITIVE_INFINITY)).toBeNull();
        expect(formatFileSize(Number.NEGATIVE_INFINITY)).toBeNull();
        expect(formatFileSize(-1)).toBeNull();
    });

    it("非整数字节 应该 向下取整（stat 给整数，这里只是防线）", () => {
        expect(formatFileSize(12.9)).toBe("12 B");
    });
});

describe("composeStatusBarText 状态栏文本拼装", () => {
    const label = (size: string): string => `Size: ${size}`;

    it("有大小 应该 接在字数段后面、带标签、两空格分隔", () => {
        expect(composeStatusBarText("Lines(src): 120  Words: 3,400  Chars: 8,900", "12.3 KB", label))
            .toBe("Lines(src): 120  Words: 3,400  Chars: 8,900  Size: 12.3 KB");
    });

    it("取不到大小 应该 整段省略（不显示 0 B / 空标签）", () => {
        expect(composeStatusBarText("Lines(src): 1  Words: 2  Chars: 3", null, label))
            .toBe("Lines(src): 1  Words: 2  Chars: 3");
    });

    it("标签由调用方注入（中英各自 l10n）", () => {
        const zh = (size: string): string => `大小: ${size}`;
        expect(composeStatusBarText("行(源): 1  字: 2  字符: 3", "2.4 MB", zh))
            .toBe("行(源): 1  字: 2  字符: 3  大小: 2.4 MB");
    });

    it("大小段必须带标签 不应该 只追加裸数字", () => {
        const out = composeStatusBarText("base", "980 B", label);
        expect(out).toContain("Size:");
        expect(out).not.toBe("base  980 B");
    });
});
