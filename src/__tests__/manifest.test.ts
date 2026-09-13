/**
 * 清单（package.json）与本地化文件（package.nls*.json）之间的契约。
 *
 * 背景（2026-09-13 查证 VS Code 1.137.0 源码）：编辑器标题「… → Reopen Editor With」那一行由
 * `editorTypePicker.ts` 的 labelWithSource 构造，对**第三方**编辑器一律拼成
 * 「<contributes.customEditors[].displayName> - <扩展 displayName>」——后半段来自
 * `contributedCustomEditors.ts` 的 providerDisplayName（= 扩展 displayName，取不到才退回扩展 id），
 * 且只有内置提供方（detail === "Built-in"）才省略后缀。也就是说自定义编辑器显示名一旦与扩展
 * 显示名相同，菜单里必然是「EPYTOR - EPYTOR」（v1.1.x ~ v1.2.0 一直如此）。
 *
 * 本文件把这条契约与 nls 的完整性钉住，避免以后再靠手测去发现。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface NlsMap {
    [key: string]: string;
}

interface CustomEditorContribution {
    viewType: string;
    displayName?: string;
}

interface Manifest {
    displayName?: string;
    contributes?: {
        customEditors?: CustomEditorContribution[];
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

const root = process.cwd();
const manifest = JSON.parse(readFileSync(path.resolve(root, "package.json"), "utf-8")) as Manifest;
const nlsEn = JSON.parse(readFileSync(path.resolve(root, "package.nls.json"), "utf-8")) as NlsMap;
const nlsZh = JSON.parse(readFileSync(path.resolve(root, "package.nls.zh-cn.json"), "utf-8")) as NlsMap;

/** 占位符判定与 VS Code 的 nls 替换一致：整串以 % 开头并以 % 结尾（`extensionNls.ts`） */
function placeholderKey(value: string): string | undefined {
    return value.length > 1 && value.startsWith("%") && value.endsWith("%")
        ? value.slice(1, -1)
        : undefined;
}

/** 递归收集清单里出现的全部 nls 占位符键（清单任意层级都可写 %key%） */
function collectPlaceholders(value: unknown, out: Set<string>): void {
    if (typeof value === "string") {
        const key = placeholderKey(value);
        if (key !== undefined) {
            out.add(key);
        }
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) {
            collectPlaceholders(item, out);
        }
        return;
    }
    if (value !== null && typeof value === "object") {
        for (const item of Object.values(value as Record<string, unknown>)) {
            collectPlaceholders(item, out);
        }
    }
}

/** 按 VS Code 的规则解析清单里的显示名（占位符查表，普通字面量原样返回） */
function resolveDisplayName(value: string | undefined, nls: NlsMap): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    const key = placeholderKey(value);
    return key === undefined ? value : nls[key];
}

const placeholders = new Set<string>();
collectPlaceholders(manifest, placeholders);
const customEditors = manifest.contributes?.customEditors ?? [];

describe("package.json 与 nls 契约", () => {
    it("自定义编辑器显示名 应该 与扩展显示名不同（相同会让菜单显示成「EPYTOR - EPYTOR」）", () => {
        expect(customEditors.length).toBeGreaterThan(0);

        for (const editor of customEditors) {
            const label = resolveDisplayName(editor.displayName, nlsEn);
            expect(label, `${editor.viewType} 的 displayName 没能解析出译文`).toBeTruthy();
            expect(label, `${editor.viewType} 的菜单行会拼成「${label} - ${manifest.displayName}」`).not.toBe(
                manifest.displayName,
            );
        }
    });

    it("package.json 引用的占位符 应该 在中英两份 nls 里都有非空译文", () => {
        expect(placeholders.size).toBeGreaterThan(0);

        for (const key of placeholders) {
            expect(nlsEn[key], `package.nls.json 缺 %${key}%`).toBeTruthy();
            expect(nlsZh[key], `package.nls.zh-cn.json 缺 %${key}%`).toBeTruthy();
        }
    });

    it("两份 nls 的键集合 应该 完全一致", () => {
        expect(Object.keys(nlsEn).sort()).toEqual(Object.keys(nlsZh).sort());
    });

    it("nls 里 应该 没有 package.json 已不引用的孤儿键", () => {
        expect(Object.keys(nlsEn).filter((key) => !placeholders.has(key))).toEqual([]);
    });
});
