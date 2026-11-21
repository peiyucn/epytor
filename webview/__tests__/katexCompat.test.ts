import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import katex from "katex";

describe("katex API 兼容性（mermaid 数学标签 + epytor 公式共用）", () => {
    it.each(["mathml", "htmlAndMathml"] as const)(
        "renderToString 应该 支持 mermaid 使用的 output=%s",
        (output) => {
            const html = katex.renderToString("x^2 + \\frac{1}{2}", {
                throwOnError: true,
                displayMode: true,
                output,
            });

            expect(html).toContain("<math");
        },
    );

    it("版本 应该 为 0.19.x（与 epytor 根依赖及上游 crepe 的声明一致）", () => {
        expect(katex.version).toMatch(/^0\.19\./);
    });

    it("版本 应该 不低于 0.18.2（GHSA-238p-pmpm-9mq7：原型污染可绕过 trust 限制）", () => {
        const match = katex.version.match(/^0\.(\d+)\.(\d+)/);

        expect(match, `无法解析 katex 版本号：${katex.version}`).not.toBeNull();
        const [, minor, patch] = match!.map(Number);
        const isPatched = minor > 18 || (minor === 18 && patch >= 2);
        expect(isPatched, `katex ${katex.version} 低于修补版 0.18.2`).toBe(true);
    });

    it("版本 应该 不是 0.18.11（该版把破坏性变更发成了补丁版，已被官方弃用）", () => {
        expect(katex.version).not.toBe("0.18.11");
    });

    it("@types/katex 应该 保持不统一（上游 DT 停在 0.16，katex 自带类型）", () => {






        const katexPkg = createRequire(import.meta.url)("katex/package.json") as {
            types?: string;
            exports?: Record<string, { types?: string } | string>;
        };

        expect(katexPkg.types, "katex 应自带类型声明").toBeTruthy();

        const workspaceYaml = readFileSync(
            path.resolve(process.cwd(), "pnpm-workspace.yaml"),
            "utf-8",
        );
        expect(workspaceYaml).not.toMatch(/^\s+"?@types\/katex"?:/m);
    });
});
