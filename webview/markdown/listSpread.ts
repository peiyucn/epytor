/**
 * List spread normalization (pure, called from the editor plugin).
 *
 * Split out because range mapping once broke IME undo (the whole undo became a no-op) and
 * could only be covered by booting an editor; both halves are pure and directly testable.
 */
import type { Node as ProseNode, Schema } from "@milkdown/kit/prose/model";
import type { StepMap } from "@milkdown/kit/prose/transform";
import type { Transaction } from "@milkdown/kit/prose/state";

/** Map a position through maps[start..] to its final document coordinate. */
function mapThrough(maps: readonly StepMap[], start: number, pos: number, assoc: number): number {
    let result = pos;
    for (let i = start; i < maps.length; i++) { result = maps[i].map(result, assoc); }
    return result;
}

/**
 * Map every changed range into final-document coordinates.
 *
 * Each StepMap's newStart/newEnd refer to the document after that step, and the document
 * can grow and shrink again across steps (IME commit: pinyin inserted, then replaced by a
 * candidate), so using them directly can run past the end. Result is clamped to
 * `[0, docSize]`; no changes or no usable range yields null.
 */
export function changeRangeInFinalDoc(
    transactions: readonly Transaction[],
    docSize: number,
): { from: number; to: number } | null {
    const maps: StepMap[] = [];
    for (const tr of transactions) {
        if (!tr.docChanged) { continue; }
        for (const step of tr.steps) { maps.push(step.getMap()); }
    }
    if (!maps.length) { return null; }

    let from = docSize;
    let to = 0;
    maps.forEach((map, i) => {
        map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
            const mappedFrom = mapThrough(maps, i + 1, newStart, 1);
            const mappedTo = mapThrough(maps, i + 1, newEnd, -1);
            if (mappedFrom < from) { from = mappedFrom; }
            if (mappedTo > to) { to = mappedTo; }
        });
    });

    // Defensive clamp: an out-of-range position would make nodesBetween read undefined.
    from = Math.max(0, Math.min(from, docSize));
    to = Math.max(0, Math.min(to, docSize));
    return from > to ? null : { from, to };
}

/**
 * Normalize spread for lists inside the range, touching only list *items*.
 *
 * Regression: recalculating both levels had two faults. An item holding a sub-list has two
 * blocks but no blank line, yet `childCount > 1` marked it loose, so serialization inserted
 * a blank line between every item ("levels below got scrambled"). And recalculating the
 * list-level spread rewrote the user's own blank lines between items.
 *
 * An item's spread follows only from its paragraph count. Returns whether anything changed;
 * errors are swallowed because attribute cleanup is best-effort and must never drop a user
 * transaction (undo once did nothing).
 */
export function normalizeListSpread(
    doc: ProseNode,
    schema: Schema,
    tr: Transaction,
    range: { from: number; to: number },
): boolean {
    let changed = false;
    try {
        doc.nodesBetween(range.from, range.to, (node, pos) => {
            if (node.type !== schema.nodes.bullet_list && node.type !== schema.nodes.ordered_list) {
                return;
            }
            let offset = 1;
            node.forEach((item) => {
                const needsSpread = countParagraphs(item) > 1;
                if (item.attrs.spread !== needsSpread) {
                    tr.setNodeMarkup(pos + offset, undefined, { ...item.attrs, spread: needsSpread });
                    changed = true;
                }
                offset += item.nodeSize;
            });
        });
    } catch {
        return false;
    }
    return changed;
}

/** Direct child paragraphs (sub-lists and blockquotes do not count); `childCount > 1` misclassified sub-list items. */
function countParagraphs(item: ProseNode): number {
    let count = 0;
    item.forEach((child) => {
        if (child.type.name === "paragraph") { count += 1; }
    });
    return count;
}
