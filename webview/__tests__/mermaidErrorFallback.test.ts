/**
 * mermaid 语法错误时的降级行为（回归：错误炸弹图滞留在文档最底部）。
 *
 * mermaid 的 `render()` 在语法错误时默认**自己画一张「炸弹 + Syntax error in text」
 * 大图**并插入 `<body>`——这段 SVG 不归我们控制，会停在整篇文档的最下面。
 * 修复：initialize 时置 `suppressErrorRendering: true`，让 mermaid 直接抛错，
 * 由 editor.ts 的 catch 在**代码块自己的预览区**显示一行简洁错误。
 */
import { describe, expect, it } from "vitest";
import mermaid from "mermaid";
import { mermaidInitConfig } from "../editor/mermaid";

describe("mermaid 错误渲染策略", () => {
    it("默认配置 应该 会把错误画成炸弹图（这是我们要规避的上游行为）", () => {
        const cfg = mermaid.mermaidAPI.getConfig();
        // 上游默认值就是 false —— 正是它导致了炸弹图
        expect(cfg.suppressErrorRendering).toBe(false);
    });

    it("统一配置函数 应该 开启 suppressErrorRendering（两个 initialize 调用点共用它）", () => {
        // Import the value the editor actually passes instead of scraping editor.ts: the old
        // assertion broke on any refactor while only proving the text existed somewhere.
        expect(mermaidInitConfig(false)).toEqual({
            startOnLoad: false,
            theme: "default",
            suppressErrorRendering: true,
        });
        expect(mermaidInitConfig(true)).toEqual({
            startOnLoad: false,
            theme: "dark",
            suppressErrorRendering: true,
        });
    });

    it("开启后 应该 抛错而不是画图，且不在 body 里留下错误 SVG", async () => {
        // jsdom 无布局能力，但 mermaid 的「是否走错误图分支」是纯配置判断，
        // 抛错路径可在 jsdom 里验证。
        const bodyChildrenBefore = document.body.children.length;

        mermaid.initialize({
            startOnLoad: false,
            suppressErrorRendering: true,
        });

        let threw = false;
        try {
            await mermaid.render("probe-bad-syntax", "这是非法的 mermaid 语法 (((");
        } catch {
            threw = true;
        }

        expect(threw, "开启 suppressErrorRendering 后应抛错").toBe(true);
        // 不应向 body 追加错误图容器
        const errSvgs = document.body.querySelectorAll("svg[aria-roledescription='error'], #d-probe-bad-syntax");
        expect(errSvgs).toHaveLength(0);
        expect(document.body.children.length).toBe(bodyChildrenBefore);
    }, 20000);
});
