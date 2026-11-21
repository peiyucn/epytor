
import { describe, expect, it } from "vitest";
import mermaid from "mermaid";
import { mermaidInitConfig } from "../editor/mermaid";

describe("mermaid 错误渲染策略", () => {
    it("默认配置 应该 会把错误画成炸弹图（这是我们要规避的上游行为）", () => {
        const cfg = mermaid.mermaidAPI.getConfig();

        expect(cfg.suppressErrorRendering).toBe(false);
    });

    it("统一配置函数 应该 开启 suppressErrorRendering（两个 initialize 调用点共用它）", () => {


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

        const errSvgs = document.body.querySelectorAll("svg[aria-roledescription='error'], #d-probe-bad-syntax");
        expect(errSvgs).toHaveLength(0);
        expect(document.body.children.length).toBe(bodyChildrenBefore);
    }, 20000);
});
