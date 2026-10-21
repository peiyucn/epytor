/**
 * katex 单一版本守卫（回归 B1）。
 *
 * mermaid 的数学标签（`$$...$$`）与 epytor 的数学公式共用同一个 katex——此前
 * mermaid 走嵌套的 katex@0.16.47、epytor 走根依赖 katex@0.18.1：产物里出现
 * 两个 261KB 的 katex chunk，且 mermaid 生成的 HTML 用的是 0.16 的 class 名、
 * 加载的样式表却是 0.18 的（样式错配）。已在 pnpm-workspace.yaml 用 overrides
 * 收敛为单一版本。
 *
 * 本测试锁住「mermaid 用到的 katex API 在当前版本可用」，升级 katex 时若 API 变动
 * 会直接失败（比等到真实浏览器里 mermaid 数学标签渲染异常更早暴露）。
 */
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
        // 这条不是「测行为」，是挡住「顺手把 @types/katex 也 override 掉」的冲动。
        // 事实：katex 自 0.16 起自带 types（package.json 的 types + exports.types），
        // DefinitelyTyped 因此停在 @types/katex@0.16.8 不再跟进；两个 tsconfig 都开
        // skipLibCheck，且 epytor 自己 import katex 拿到的是自带类型（@types/katex 在
        // 顶层不可解析，只嵌在 micromark-extension-math 目录里服务它自己）。
        // 详见 pnpm-workspace.yaml 的 katex override 注释。
        const katexPkg = require("katex/package.json") as {
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
