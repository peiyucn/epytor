/**
 * 回归（owner 手测 2026-09-17）：「点击 toc 内容切换没问题，但高亮表现不稳定、经常自己乱跑」。
 *
 * 根因：**跳转落点与「当前章节」判据用了两套基准**。
 *   - 判据（utils/headingSticky.ts 的 currentHeadingIndex）：当前章节 = 最后一个
 *     **顶边已划过阅读线**的标题（`top < readingLineY`）；
 *   - 旧落点：`标题顶边 - 顶栏底 - 8px` → 目标标题停在阅读线**下方 8px**，判据不成立。
 *
 * 于是点第 k 项后高亮停在第 k-1 项、点第一项则整片无高亮（实测：clicked 0→active -1、
 * 1→0、2→1、3→2）。本测试把「落点必须让被点标题成为当前章节」锁成不变量。
 */
import { describe, expect, it } from "vitest";
import { HEADING_JUMP_OVERLAP_PX, headingScrollTop } from "../utils/headingScroll";
import { currentHeadingIndex, type StickyHeadingRect } from "../utils/headingSticky";

const READING_LINE_Y = 36;
const HEADING_HEIGHT = 40;

/** 把「文档坐标 + 落点 scrollTop」换算成判据要的视口矩形（模拟一次瞬时滚动） */
function viewportRects(docTops: number[], scrollTop: number): StickyHeadingRect[] {
    return docTops.map((docTop) => ({
        depth: 1,
        top: docTop - scrollTop,
        sectionBottom: 0,
    }));
}

describe("跳转落点与「当前章节」判据同基准（回归：点击目录后高亮停在前一项）", () => {
    it("跳到任意标题后 该标题 应该 就是当前章节", () => {
        // 标题等距排布；覆盖「文档靠前（落点会被钳到 0）」与「文档中部」两类
        const docTops = [60, 400, 900, 1500, 2400];

        docTops.forEach((docTop, index) => {
            const scrollTop = headingScrollTop(docTop, READING_LINE_Y);
            const active = currentHeadingIndex(viewportRects(docTops, scrollTop), READING_LINE_Y);

            expect({ clicked: index, active }).toEqual({ clicked: index, active: index });
        });
    });

    it("被点标题的顶边 应该 停在阅读线之上一点（不是下方留白）", () => {
        const docTop = 900;
        const scrollTop = headingScrollTop(docTop, READING_LINE_Y);
        const headingTop = docTop - scrollTop;

        // 越过阅读线（判据成立），但又只越过一点点（字形不被顶栏吃掉）
        expect(headingTop).toBeLessThan(READING_LINE_Y);
        expect(READING_LINE_Y - headingTop).toBe(HEADING_JUMP_OVERLAP_PX);
    });

    it("文档顶部附近的标题 应该 把落点钳到 0，且仍是当前章节", () => {
        const docTops = [10, 500];
        const scrollTop = headingScrollTop(docTops[0], READING_LINE_Y);

        expect(scrollTop).toBe(0);
        expect(currentHeadingIndex(viewportRects(docTops, scrollTop), READING_LINE_Y)).toBe(0);
    });

    it("越界输入 不应该 产生负数落点", () => {
        expect(headingScrollTop(0, READING_LINE_Y)).toBe(0);
        expect(headingScrollTop(-50, READING_LINE_Y)).toBe(0);
    });

    it("对照：旧落点（阅读线下方留白 8px）在本判据下会漏掉被点项 —— 这正是回归成因", () => {
        const docTops = [60, 400, 900];
        const clicked = 1;
        const legacyScrollTop = docTops[clicked] - READING_LINE_Y - 8; // 旧实现：- VIEWPORT_PADDING

        // 旧落点把标题放到阅读线下方 8px → 判据只认到前一项
        expect(docTops[clicked] - legacyScrollTop).toBeGreaterThan(READING_LINE_Y);
        expect(currentHeadingIndex(viewportRects(docTops, legacyScrollTop), READING_LINE_Y)).toBe(clicked - 1);
    });

    it("标题高度 不应该 影响判据（判据只看顶边）", () => {
        const docTops = [60, 400, 900];
        const scrollTop = headingScrollTop(docTops[2], READING_LINE_Y);
        const rects = viewportRects(docTops, scrollTop).map((r) => ({
            ...r,
            sectionBottom: r.top + HEADING_HEIGHT,
        }));

        expect(currentHeadingIndex(rects, READING_LINE_Y)).toBe(2);
    });
});
