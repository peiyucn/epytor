
import type { Node as ProseNode, Schema } from "@milkdown/kit/prose/model";
import type { StepMap } from "@milkdown/kit/prose/transform";
import type { Transaction } from "@milkdown/kit/prose/state";


function mapThrough(maps: readonly StepMap[], start: number, pos: number, assoc: number): number {
    let result = pos;
    for (let i = start; i < maps.length; i++) { result = maps[i].map(result, assoc); }
    return result;
}


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


    from = Math.max(0, Math.min(from, docSize));
    to = Math.max(0, Math.min(to, docSize));
    return from > to ? null : { from, to };
}


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


function countParagraphs(item: ProseNode): number {
    let count = 0;
    item.forEach((child) => {
        if (child.type.name === "paragraph") { count += 1; }
    });
    return count;
}
