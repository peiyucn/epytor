/**
 * 编辑气泡的边界留白常量。
 *
 * 气泡的水平位置由 latexFeature 的 `clampIntoContentViewport` 中间件夹紧
 * （在 floating-ui pipeline 末尾按「正文真实可视区」修正最终 x），不在这里算。
 * 之所以不在本模块算几何：TOC 是 `position: fixed` 浮层，不在气泡的
 * clippingAncestors 里，也不在 body padding 的裁剪范围内——floating-ui 的
 * `boundary` 只收静态值，而面板宽度会随拖动/开关变化，必须每次定位现算。
 */

/** 气泡与可视区边界之间的最小留白（px）：留一点缝，避免看起来像被裁掉 */
export const BUBBLE_BOUNDARY_PADDING = 8;
