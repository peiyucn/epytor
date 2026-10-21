/**
 * 编辑气泡的**可视边界**（左侧避开 TOC 侧栏）。
 *
 * 背景（owner 真机反馈 2026-10-20）：行内公式的编辑气泡被左侧目录（TOC）面板挡住。
 * 原因是 floating-ui 的边界默认取 `clippingAncestors`——沿 DOM 祖先链找会裁剪的元素。
 * 而 TOC 面板是 `position: fixed` 的**浮层**，不是气泡的祖先，floating-ui 完全看不见它，
 * 于是气泡被定位到面板底下。正文本身是靠 `body { padding-left: <面板宽> }` 让位的，
 * but `body` 的 padding 不属于裁剪区域，floating-ui 的边界计算也不会扣掉它。
 *
 * 因此需要把「正文的真实可视区域」显式算出来交给 floating-ui 当边界：
 *   左边界 = body 的左内边距（TOC 打开时 = 面板宽度，关闭时 = 0）
 *   右边界 = 视口宽度
 *
 * 抽成纯函数以便直测（jsdom 无布局引擎，量不到真实几何，但边界计算是可测的）。
 */

/** 气泡与边界之间的最小留白（px） */
export const BUBBLE_BOUNDARY_PADDING = 8;

export interface BubbleBoundary {
    /** 左边界（含）：气泡不得超过它 */
    left: number;
    /** 右边界（含）：气泡不得超过它 */
    right: number;
}

/**
 * 计算气泡可用的水平边界。
 *
 * @param viewportWidth 视口宽度
 * @param bodyPaddingLeft body 的左内边距（TOC 打开时等于面板宽度）
 */
export function computeBubbleBoundary(
    viewportWidth: number,
    bodyPaddingLeft: number,
): BubbleBoundary {
    // Math.max(0, NaN) === NaN，必须先归一化（getComputedStyle 的像素值可能解析失败）
    const safeViewport = Number.isFinite(viewportWidth) ? viewportWidth : 0;
    const safePadding = Number.isFinite(bodyPaddingLeft) ? bodyPaddingLeft : 0;
    const left = Math.max(0, safePadding);
    // 右边界不扣 TOC（TOC 只在左侧），保持视口宽度
    const right = Math.max(left, safeViewport);
    return { left, right };
}

/** 边界内部扣除两侧留白后，气泡可用的最大宽度 */
export function usableWidth(boundary: BubbleBoundary): number {
    return Math.max(0, boundary.right - boundary.left - BUBBLE_BOUNDARY_PADDING * 2);
}
