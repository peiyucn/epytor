/**
 * 用户交互跟踪（唯一实现）。
 *
 * 回归 F4：此前两处各自注册一套监听 + 一个布尔标志——
 *   `editor.ts`：document capture 的 keydown/mousedown/paste/drop/cut + 粘滞标志（创建时重置）
 *   `index.ts` ：window 的 wheel/mousedown/keydown/touchstart + 按请求重置标志
 * 事件集不一致（滚轮、粘贴在两处口径相反），语义只靠各自注释口头约定。
 *
 * 统一为模块级单调递增 epoch：调用方在动作开始时取快照，稍后比较即可判断
 * 「期间用户是否交互过」，不再需要「何时重置标志」的约定。
 * 监听一次性注册在 capture 阶段（ProseMirror 可能 stopPropagation）。
 */
const USER_INTERACTION_EVENTS = [
    "keydown", "mousedown", "paste", "drop", "cut", "wheel", "touchstart",
] as const;

/**
 * 计入「用户交互纪元」的事件名（唯一真源）。
 * 需要「用户又动了」的消费者（如 TOC 点击钉住的解除，见 components/toc/index.ts）
 * 复用本表，不要自行另列一套——历史上两处口径不一致出过回归 F4。
 */
export const USER_INTERACTION_EVENT_TYPES: readonly string[] = USER_INTERACTION_EVENTS;

let _epoch = 0;

for (const evt of USER_INTERACTION_EVENTS) {
    document.addEventListener(
        evt,
        () => {
            _epoch += 1;
        },
        { capture: true, passive: true },
    );
}

/** 当前交互纪元：与早先取到的快照不等，即表示期间发生过用户交互 */
export function getUserInteractionEpoch(): number {
    return _epoch;
}
