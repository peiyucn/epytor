/**
 * 行内公式编辑气泡的定位计算（纯函数，可直测）。
 *
 * 为什么不用 floating-ui 的 flip/shift 决定位置：
 * - 它的边界取 `clippingAncestors`（沿祖先链找裁剪元素），而 TOC 是 `position: fixed`
 *   浮层、不在祖先链上；正文给 TOC 让位靠的是 body 的 padding-left，也不属于裁剪区域
 *   → floating-ui 看不见「编辑区」的真实范围，气泡会越出编辑区；
 * - `flip` 在下方放不下时翻到上方，翻车就直接跑到页面顶部、盖住固定工具栏（真机回归）。
 *
 * 所以这里按「公式矩形 + 编辑区边界」自己算，规则明确可测：
 *   水平：与公式左对齐 → 夹进 [编辑区左, 视口右]；
 *   垂直：优先贴公式下方 → 下方不够则贴上方 → 两边都不够则夹进编辑区（让开工具栏）。
 * 所有结果都保证落在编辑区内，不越出视口、不压固定 UI。
 */

/** 气泡与编辑区边界之间的最小留白（px） */
export const BUBBLE_BOUNDARY_PADDING = 8;

/** 气泡与公式之间的垂直间距（px） */
export const BUBBLE_GAP = 10;

/** 气泡被压缩时的最小宽度（px）：再窄就没法编辑了 */
export const BUBBLE_MIN_WIDTH = 120;

/** 浮层矩形（与 floating-ui 的 Rect 同构） */
export interface BubbleRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** 编辑区与视口的几何约束 */
export interface BubbleViewport {
    /** 编辑区左边界（= TOC 打开时 body 的 padding-left，关闭时 0） */
    contentLeft: number;
    /** 编辑区顶部（= 固定工具栏的底边，避免气泡压住工具栏） */
    contentTop: number;
    /** 视口宽度 */
    viewportWidth: number;
    /** 视口高度 */
    viewportHeight: number;
}

/** 定位结果（视口坐标，配合 strategy: "fixed"） */
export interface BubblePosition {
    x: number;
    y: number;
}

/**
 * 计算气泡位置。保证结果落在编辑区内。
 *
 * @param reference 公式元素的矩形（视口坐标）
 * @param floating  气泡自身尺寸
 * @param view      编辑区与视口约束
 */
export function placeBubble(
    reference: BubbleRect,
    floating: { width: number; height: number },
    view: BubbleViewport,
): BubblePosition {
    const pad = BUBBLE_BOUNDARY_PADDING;

    // ── 水平：左对齐公式，再夹进编辑区 ──
    const minX = view.contentLeft + pad;
    const maxX = view.viewportWidth - floating.width - pad;
    const x = Math.max(minX, Math.min(reference.x, Math.max(minX, maxX)));

    // ── 垂直：下方 → 上方 → 夹紧 ──
    const minY = view.contentTop + pad;
    const maxY = view.viewportHeight - floating.height - pad;

    const below = reference.y + reference.height + BUBBLE_GAP;
    const above = reference.y - floating.height - BUBBLE_GAP;

    let y: number;
    if (below + floating.height <= maxY) {
        y = below; // 下方放得下
    } else if (above >= minY) {
        y = above; // 翻到上方
    } else {
        y = Math.max(minY, Math.min(below, maxY)); // 两边都不够：夹紧
    }

    return { x, y: Math.max(minY, Math.min(y, Math.max(minY, maxY))) };
}
