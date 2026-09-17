/**
 * 目录高亮的「点击钉住」（纯逻辑，jsdom 可测）。
 *
 * 为什么需要（owner 手测 2026-09-17：「点击 toc 没法精准定位到被点项，内容少的时候比较明显」）：
 * 高亮由滚动几何判定——**当前章节 = 最后一个顶边划过阅读线的标题**。而阅读线在文档最后
 * `视口高 - 顶栏底` 像素内会从顶栏底逐级下滑到视口底（为「末尾几节永远高亮不到」而加）。
 *
 * 于是**短文档**（可滚动量 < 该尾部区间）里，从滚动位置 0 起阅读线就已滑到很下面：
 * 所有标题都在线的上方 → 永远取最后一项。更根本的是短文档**滚不动**到把后面的标题
 * 顶到线上，因此纯几何**无法表达**「用户点的是第 4 项」。实测（内容 1000 / 视口 800，
 * 最多滚 200px）：点第 1 项高亮落在第 4 项；长文档则逐项正确。
 *
 * 解法：把「点击」当作一次显式意图**钉住**高亮；用户再次操作（滚动 / 键盘 / 拖滚动条）
 * 即解除，交回滚动跟随。纪元来自 utils/userInteraction.ts（唯一的交互跟踪实现）。
 */

export interface HeadingHighlightPin {
    /** 被点标题的文档位置（取点击时已重绑的当前值） */
    pos: number;
    /** 钉住那一刻的用户交互纪元：此后纪元变化即表示用户又操作了 */
    epoch: number;
}

/** 记一次点击钉住 */
export function pinHeadingHighlight(pos: number, epoch: number): HeadingHighlightPin {
    return { pos, epoch };
}

export interface HighlightResolution {
    /** 本次应当高亮的位置（null = 不高亮任何项） */
    pos: number | null;
    /** 解析后的钉住状态（null = 已解除） */
    pin: HeadingHighlightPin | null;
}

/**
 * 解析本次要高亮哪一项：
 *
 * - 没有钉住 → 滚动跟随（用 `incoming`）；
 * - 钉住且用户**尚未**再次交互 → 保持被点项（短文档的关键：滚不动也能钉住）；
 * - 钉住但用户已再次交互 → 解除，交回滚动跟随。
 */
export function resolveHighlight(
    pin: HeadingHighlightPin | null,
    incoming: number | null,
    currentEpoch: number,
): HighlightResolution {
    if (pin === null) { return { pos: incoming, pin: null }; }
    if (currentEpoch !== pin.epoch) { return { pos: incoming, pin: null }; }
    return { pos: pin.pos, pin };
}
