/**
 * 锚点链接目标解析（回归 2026-09-17 探针实测）：编辑器给标题挂的 id 是**标题原文**
 * （`## 中文 标题（含括号）` → `id="中文-标题（含括号）"`），而链接片段有两种写法：
 *   - 原文 `#中文-标题（含括号）` → 直接命中；
 *   - 百分号编码 `#%E4%B8%AD%E6%96%87...`（非 ASCII 锚点复制链接时的常见形态）
 *     → 用编码串直查**永远查不到**，点了没反应。
 */
import { afterEach, describe, expect, it } from "vitest";
import { CrepeBuilder } from "@milkdown/crepe";
import { anchorIdCandidates } from "../utils/anchorTarget";

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() { /* noop */ } unobserve() { /* noop */ } disconnect() { /* noop */ }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() { /* noop */ }, removeListener() { /* noop */ },
        addEventListener() { /* noop */ }, removeEventListener() { /* noop */ },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}
(window as unknown as Record<string, unknown>).__i18n = {
    translations: {}, isMac: false, serializationMode: "clean",
};

afterEach(() => { document.body.innerHTML = ""; });

describe("anchorIdCandidates（锚点片段 → 候选 id）", () => {
    it("原文片段 应该 原样作为候选", () => {
        expect(anchorIdCandidates("中文-标题（含括号）")).toEqual(["中文-标题（含括号）"]);
        expect(anchorIdCandidates("hello-world!")).toEqual(["hello-world!"]);
    });

    it("百分号编码片段 应该 追加解码后的候选（且原文优先）", () => {
        const encoded = "%E4%B8%AD%E6%96%87-%E6%A0%87%E9%A2%98%EF%BC%88%E5%90%AB%E6%8B%AC%E5%8F%B7%EF%BC%89";
        expect(anchorIdCandidates(encoded)).toEqual([encoded, "中文-标题（含括号）"]);
    });

    it("纯 ASCII 片段 应该 只给一个候选（不必重复解码）", () => {
        expect(anchorIdCandidates("hello-world")).toEqual(["hello-world"]);
    });

    it("空片段 应该 返回空数组", () => {
        expect(anchorIdCandidates("")).toEqual([]);
    });

    it("非法转义 不应该 抛错，退回原文候选", () => {
        // `%E4` 是不完整的多字节转义、`100%` 是裸百分号：decodeURIComponent 会抛，
        // 必须兜住（否则点击链接直接抛进事件回调）
        expect(() => anchorIdCandidates("%E4")).not.toThrow();
        expect(anchorIdCandidates("%E4")).toEqual(["%E4"]);
        expect(anchorIdCandidates("100%")).toEqual(["100%"]);
    });

    it("空格编码 应该 解码（`%20` → 空格）", () => {
        expect(anchorIdCandidates("a%20b")).toEqual(["a%20b", "a b"]);
    });

    it("不做 slug 归一化：GitHub 风格 slug 与编辑器实际 id 不一致时不硬猜", () => {
        // 编辑器给 `Hello World!` 挂的 id 是 `hello-world!`，而 GitHub slug 是 `hello-world`；
        // 本函数只处理编码差异，不猜 slug（交给调用方查不到就什么都不做）
        expect(anchorIdCandidates("hello-world")).toEqual(["hello-world"]);
    });
});

describe("与真实编辑器 DOM 对接（回归：编码锚点点了没反应）", () => {
    /** 复刻 webview/index.ts 的解析：按候选顺序查 id，取第一个命中的 */
    function resolveAnchor(fragment: string): HTMLElement | null {
        return anchorIdCandidates(fragment)
            .map((id) => document.getElementById(id))
            .find((el): el is HTMLElement => el !== null) ?? null;
    }

    async function mount(md: string): Promise<void> {
        const root = document.createElement("div");
        document.body.appendChild(root);
        const crepe = new CrepeBuilder({ root, defaultValue: md });
        await crepe.create();
    }

    it("原文片段 应该 命中标题元素", async () => {
        await mount("# 中文 标题\n\n正文\n");
        expect(resolveAnchor("中文-标题")).not.toBeNull();
    });

    it("百分号编码片段 应该 命中同一个标题元素（修复前为 null）", async () => {
        await mount("# 中文 标题\n\n正文\n");
        const encoded = encodeURIComponent("中文-标题");

        expect(document.getElementById(encoded)).toBeNull(); // 直查确实查不到（回归成因）
        expect(resolveAnchor(encoded)).toBe(document.getElementById("中文-标题"));
    });

    it("查不到的目标 应该 安静返回 null（不抛错、不误跳）", async () => {
        await mount("# 标题\n\n正文\n");
        expect(resolveAnchor("不存在-的-锚点")).toBeNull();
        expect(resolveAnchor("100%")).toBeNull();
    });
});
