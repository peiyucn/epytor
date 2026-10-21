/**
 * 行内公式编辑气泡的定位（回归：气泡越出编辑区 / 压住固定工具栏）。
 *
 * 定位算法在 webview/utils/bubbleBoundary.ts 的 placeBubble（纯函数，可直测）。
 * 这里测的是**数学结果**，不是「代码里有没有某个字符串」——前几轮吃过的教训：
 * 断言接线存在，但算出来的坐标是错的，真机照样不对。
 *
 * jsdom 无布局引擎，所以几何全部由用例显式给定，不依赖真实渲染。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
    BUBBLE_BOUNDARY_PADDING,
    BUBBLE_GAP,
    placeBubble,
} from "../utils/bubbleBoundary";

/** 典型编辑区：左侧 TOC 占 200，顶部工具栏占 36，视口 1200×800 */
const VIEW = {
    contentLeft: 200,
    contentTop: 36,
    viewportWidth: 1200,
    viewportHeight: 800,
};

/** 气泡尺寸 */
const FLOAT = { width: 260, height: 44 };

describe("placeBubble：气泡必须落在编辑区内", () => {
    it("正常情况下 应该 贴在公式下方", () => {
        const pos = placeBubble({ x: 400, y: 300, width: 40, height: 20 }, FLOAT, VIEW);

        expect(pos.x).toBe(400);
        expect(pos.y).toBe(300 + 20 + BUBBLE_GAP);
    });

    it("公式贴编辑区左边（TOC 后面）时 应该 不越到 TOC 底下", () => {
        // 公式在 x=200（紧贴 TOC 右缘）
        const pos = placeBubble({ x: 200, y: 300, width: 20, height: 20 }, FLOAT, VIEW);

        expect(pos.x).toBeGreaterThanOrEqual(VIEW.contentLeft + BUBBLE_BOUNDARY_PADDING);
        expect(pos.x).toBeGreaterThanOrEqual(200);
    });

    it("公式贴视口右边时 应该 把气泡拉回来，不越出右边界", () => {
        const pos = placeBubble({ x: 1180, y: 300, width: 20, height: 20 }, FLOAT, VIEW);

        expect(pos.x + FLOAT.width).toBeLessThanOrEqual(
            VIEW.viewportWidth - BUBBLE_BOUNDARY_PADDING,
        );
    });

    it("公式贴近视口底部、下方放不下时 应该 翻到上方（而不是跑到页面顶部压住工具栏）", () => {
        // 公式在 y=780，下方没有空间
        const pos = placeBubble({ x: 400, y: 780, width: 40, height: 18 }, FLOAT, VIEW);

        // 必须翻到公式上方
        expect(pos.y).toBeLessThan(780);
        expect(pos.y).toBe(780 - FLOAT.height - BUBBLE_GAP);
    });

    it("上下都放不下时 应该 夹在编辑区内，且不压住顶部工具栏", () => {
        // 极矮视口，几乎没有空间
        const tight = { ...VIEW, viewportHeight: 120 };
        const pos = placeBubble({ x: 400, y: 60, width: 40, height: 20 }, FLOAT, tight);

        expect(pos.y).toBeGreaterThanOrEqual(tight.contentTop + BUBBLE_BOUNDARY_PADDING);
        expect(pos.y + FLOAT.height).toBeLessThanOrEqual(
            tight.viewportHeight - BUBBLE_BOUNDARY_PADDING,
        );
    });

    it("任何输入下 气泡都不压倒顶部工具栏（contentTop 之上）", () => {
        // 扫一批极端位置，全部必须满足「y >= contentTop + padding」
        for (const y of [0, 10, 36, 50, 100, 400, 700, 790, 800]) {
            const pos = placeBubble({ x: 400, y, width: 40, height: 20 }, FLOAT, VIEW);
            expect(
                pos.y,
                `公式 y=${y} 时气泡上边界越过了工具栏`,
            ).toBeGreaterThanOrEqual(VIEW.contentTop + BUBBLE_BOUNDARY_PADDING);
        }
    });

    it("任何输入下 气泡都不越出视口右边界", () => {
        for (const x of [0, 100, 200, 600, 1000, 1180, 1200]) {
            const pos = placeBubble({ x, y: 300, width: 20, height: 20 }, FLOAT, VIEW);
            expect(
                pos.x + FLOAT.width,
                `公式 x=${x} 时气泡越出了右边界`,
            ).toBeLessThanOrEqual(VIEW.viewportWidth - BUBBLE_BOUNDARY_PADDING + 0.001);
            expect(pos.x).toBeGreaterThanOrEqual(VIEW.contentLeft);
        }
    });

    it("气泡比编辑区还宽时 应该 贴左且不越出（宽度由 size 中间件另行收窄）", () => {
        const huge = { width: 2000, height: 44 };
        const pos = placeBubble({ x: 400, y: 300, width: 20, height: 20 }, huge, VIEW);

        expect(pos.x).toBe(VIEW.contentLeft + BUBBLE_BOUNDARY_PADDING);
    });
});

describe("接线（latexFeature）", () => {
    const latexSrc = readFileSync(
        path.resolve(process.cwd(), "webview/vendor/latexFeature.ts"),
        "utf-8",
    );

    it("应该 用 placeInsideContentViewport 定位，且不再用 flip/shift 推断", () => {
        const m = latexSrc.match(/middleware:\s*\[([\s\S]*?)\],\s*\}\);/);
        expect(m, "找不到 middleware 数组").not.toBeNull();
        const list = m![1];

        expect(list).toContain("placeInsideContentViewport()");
        // flip/shift 会让气泡翻到页面顶部压住工具栏，必须不用
        expect(list).not.toContain("flip(");
        expect(list).not.toContain("shift(");
        // clamp 必须在 size 之后（要用最终尺寸算右边界）
        expect(list.indexOf("size(")).toBeLessThan(
            list.indexOf("placeInsideContentViewport()"),
        );
    });

    it("定位应该 委托给纯函数 placeBubble，并传入浏览器实测几何", () => {
        const fn = latexSrc.slice(
            latexSrc.indexOf("function placeInsideContentViewport"),
            latexSrc.indexOf("type LatexTooltipProps"),
        );

        expect(fn).toContain("placeBubble(");
        expect(fn).toContain("rects.reference");
        expect(fn).toContain("rects.floating");
        // 编辑区左边界来自 body 的 padding-left（TOC 占位）
        expect(fn).toContain("getComputedStyle(document.body)");
        expect(fn).toContain("paddingLeft");
        // 编辑区顶部来自固定工具栏底边
        expect(fn).toContain("milkdown-top-bar");
    });

    it("气泡应该 留在 .milkdown 内（继承 --crepe-* 变量；fixed 不需要挪到 body）", () => {
        // 挪到 body 会丢失 .milkdown 上定义的 --crepe-color-surface / --crepe-font-code
        // 等变量，按钮与图标样式崩掉（真机回归）。
        expect(latexSrc).not.toContain("document.body.appendChild(content)");
        expect(latexSrc).not.toMatch(/root:\s*document\.body/);
        // strategy 仍是 fixed：.milkdown 只有 position:relative，无 transform/filter，
        // 不会让 fixed 退化
        expect(latexSrc).toMatch(/strategy:\s*"fixed"/);
    });

    it("定位策略 应该是 fixed", () => {
        expect(latexSrc).toMatch(/strategy:\s*"fixed"/);
    });
});

const latexCss = readFileSync(
    path.resolve(process.cwd(), "webview/latex.css"),
    "utf-8",
);

describe("样式（latex.css）", () => {
    function bubbleRule(): string {
        const m = /\.milkdown-latex-inline-edit\s*\{([^}]*)\}/.exec(latexCss);
        expect(m, "找不到气泡样式规则").not.toBeNull();
        return m![1];
    }

    it("气泡 position 应该 与 fixed 策略一致", () => {
        expect(bubbleRule()).toMatch(/position:\s*fixed/);
        expect(bubbleRule()).not.toMatch(/position:\s*absolute/);
    });

    it("z-index 应该 低于所有固定 UI（标题条 90 / TOC 101+ / 顶栏 102）", () => {
        const z = /z-index:\s*(\d+)/.exec(bubbleRule());
        expect(z, "气泡应声明 z-index").not.toBeNull();
        expect(Number(z![1])).toBeLessThan(90);
        expect(Number(z![1])).toBeGreaterThan(0);
    });

    it("选择器 应该 带 .milkdown 前缀（气泡留在 .milkdown 内以继承 --crepe-* 变量）", () => {
        // 挪到 body 会继承不到 --crepe-color-surface / --crepe-font-code，按钮与
        // 图标样式崩掉（真机回归：确认按钮变白底方块）。
        expect(latexCss).toMatch(/\.milkdown \.milkdown-latex-inline-edit\s*\{/);
    });

});



describe("外观必须与链接/文件引用弹层完全一致（镜像 style.css 的覆盖值）", () => {
    const latexCssNoComments = latexCss.replace(/\/\*[\s\S]*?\*\//g, "");
    const styleCss = readFileSync(
        path.resolve(process.cwd(), "webview/style.css"),
        "utf-8",
    );

    function ruleBody(selector: string): string {
        const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const m = new RegExp(esc + "\\s*\\{([^}]*)\\}").exec(latexCssNoComments);
        expect(m, `找不到规则 ${selector}`).not.toBeNull();
        return m![1];
    }

    it("基准存在：style.css 确实用 VS Code 风格重写过 link 弹层（不是 crepe 原值）", () => {
        expect(styleCss).toMatch(
            /\.milkdown-link-edit > \.link-edit \{[\s\S]*?background: var\(--vscode-editorWidget-background/,
        );
        expect(styleCss).toMatch(
            /\.milkdown-link-edit \.input-area \{[\s\S]*?background: var\(--vscode-input-background/,
        );
    });

    it("外框容器 应该 镜像 .link-edit：32px 最小高 / padding 3px 6px / 6px 圆角 / 1px 边框 / gap 2", () => {
        const body = ruleBody(".milkdown .milkdown-latex-inline-edit .container");

        expect(body).toMatch(/min-height:\s*32px/);
        expect(body).toMatch(/padding:\s*3px\s+6px/);
        expect(body).toMatch(/border-radius:\s*6px/);
        expect(body).toMatch(/border:\s*1px solid var\(--vscode-editorWidget-border/);
        expect(body).toMatch(/gap:\s*2px/);
        expect(body).toMatch(/justify-content:\s*flex-start/);
    });

    it("输入区 应该 镜像 .input-area：200×24 / 输入框底色与边框 / 3px 圆角 / 12px 字号", () => {
        const body = ruleBody(".milkdown .milkdown-latex-inline-edit .ProseMirror");

        expect(body).toMatch(/height:\s*24px/);
        expect(body).toMatch(/width:\s*200px/);
        expect(body).toMatch(/border-radius:\s*3px/);
        expect(body).toMatch(/background:\s*var\(--vscode-input-background/);
        expect(body).toMatch(/border:\s*1px solid var\(--vscode-input-border/);
        // 字号必须 !important：style.css 的全局 !important 会命中气泡内 ProseMirror
        expect(body).toMatch(/font-size:\s*12px\s*!important/);
        // padding 同理，正文是 padding:0 !important
        expect(body).toMatch(/padding:\s*0\s+6px\s*!important/);
    });

    it("按钮 应该 镜像 .button：24px 高 / padding 0 3px / 3px 圆角 / 图标 16×16", () => {
        const btn = ruleBody(".milkdown .milkdown-latex-inline-edit .container button");
        const svg = ruleBody(".milkdown .milkdown-latex-inline-edit .container button svg");

        expect(btn).toMatch(/height:\s*24px/);
        expect(btn).toMatch(/padding:\s*0\s+3px/);
        expect(btn).toMatch(/border-radius:\s*3px/);
        expect(svg).toMatch(/width:\s*16px/);
        expect(svg).toMatch(/height:\s*16px/);
    });

    it("图标颜色 应该 跟随编辑器前景色（上游 SVG 写死 #817567，与主题脱节）", () => {
        const path = ruleBody(
            ".milkdown .milkdown-latex-inline-edit .container button svg path",
        );

        expect(path).toMatch(/fill:\s*var\(--vscode-editor-foreground\)/);
        expect(path).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    });

    it("气泡内段落 应该 去掉正文段后间距（否则比同类弹层高一截）", () => {
        const body = ruleBody(".milkdown .milkdown-latex-inline-edit .ProseMirror p");

        expect(body).toMatch(/padding:\s*0\s*!important/);
        expect(body).toMatch(/margin:\s*0\s*!important/);
    });
});