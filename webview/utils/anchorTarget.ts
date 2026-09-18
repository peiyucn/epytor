/**
 * 文档内锚点链接（`[文字](#片段)`）的目标解析（纯函数，jsdom 可测）。
 *
 * 为什么需要解码兜底（2026-09-17 探针实测）：编辑器给标题挂的 id 是**标题原文**
 * （`## 中文 标题（含括号）` → `id="中文-标题（含括号）"`），而链接片段有两种写法：
 *
 *   - 手写原文：`#中文-标题（含括号）` → `getElementById` 直接命中；
 *   - 百分号编码：`#%E4%B8%AD%E6%96%87-%E6%A0%87%E9%A2%98...`（非 ASCII 锚点从别处复制
 *     链接时常见）→ 拿编码串去查**永远查不到**，点了没反应（回归：锚点链接静默失效）。
 *
 * 因此按「原文 → 解码」的顺序给出候选（原文命中就不必解码，也避免无谓的编解码）。
 */
function safeDecodeURIComponent(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        // 片段含不完整 / 非法转义（如 `#100%`、`#%E4`）：不是可解码的编码形式，丢掉该候选
        return null;
    }
}

/**
 * 锚点片段 → 候选 id（按命中优先级排列，已去重；空片段返回空数组）。
 *
 * 只做「原文」与「整串解码」两种形态：不做 slug 归一化——GitHub 风格 slug（把
 * `Hello World!` 变成 `hello-world`）与编辑器实际挂的 id（`hello-world!`）并不一致，
 * 猜 slug 会引入新的错配，属于另一件事（见 docs/tech-debt.md）。
 */
export function anchorIdCandidates(fragment: string): string[] {
    if (fragment.length === 0) { return []; }
    const decoded = safeDecodeURIComponent(fragment);
    if (decoded === null || decoded === fragment) { return [fragment]; }
    return [fragment, decoded];
}
