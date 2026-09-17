/**
 * 「跳到某标题」的落点计算（纯函数，jsdom 可测）。
 *
 * 为什么单独抽出来：跳转落点与「当前章节」判据必须**用同一个基准**，否则会互相打架。
 * 判据在 `utils/headingSticky.ts` 的 `currentHeadingIndex()`：
 *
 *     当前章节 = 最后一个「顶边已划过阅读线」的标题（`top < readingLineY`）
 *
 * 而跳转若把目标标题落在这条线**下方**（哪怕是 8px 的留白），判据就不成立——高亮会
 * 停在被点项的**前一项**，点第一项更是整片无高亮。回归（owner 手测 2026-09-17）：
 * 「点击 toc 内容切换没问题，但高亮表现不稳定」。
 *
 * 因此落点必须**明确越过**阅读线一点：`HEADING_JUMP_OVERLAP_PX`。为什么不是刚好落在线
 * 上（重叠 0）：缓存里的标题文档坐标与点击那一刻的测量值可能有亚像素差异，落点正好压在
 * 判定边界上会时对时错；留一点重叠才能稳定判成「已越过」。为什么取这么小：重叠部分只是
 * 标题**盒顶**被顶栏遮住几像素，字形在线高之下，视觉上几乎不可见。
 */

/**
 * 跳转落点越过「当前章节」阅读线的量（px）。
 *
 * 语义：落点让目标标题顶边停在 `阅读线 - 该值`，即刚一越过阅读线。
 * 只需大于亚像素测量噪声，不需要留出视觉留白（留白会让判据不成立 = 本次回归）。
 */
export const HEADING_JUMP_OVERLAP_PX = 2;

/**
 * 计算「跳到某标题」应有的滚动位置（`window.scrollTo` 的 `top`）。
 *
 * @param headingDocTop 目标标题顶边的**文档坐标**（视口坐标 + 当前 scrollY）
 * @param readingLineY  「当前章节」阅读线的视口 y（= 顶栏底边，与 `currentHeadingIndex` 同源）
 *
 * 钳到 0：靠近文档顶部的标题算出的值可能为负（滚不上去），如实给出可滚动范围。
 */
export function headingScrollTop(headingDocTop: number, readingLineY: number): number {
    return Math.max(0, headingDocTop - readingLineY + HEADING_JUMP_OVERLAP_PX);
}
