
import type { Node as ProseNode } from "@milkdown/kit/prose/model";

export interface HeadingFoldRange {
    from: number;
    to: number;
}

export function isHeadingNode(
    node: ProseNode | null | undefined,
): node is ProseNode {
    return node?.type.name === "heading";
}

export function getHeadingLevel(node: { attrs?: Record<string, unknown> }): number {
    const level = node.attrs?.["level"];
    return typeof level === "number" ? level : 1;
}

export function findHeadingFoldRange(
    doc: ProseNode,
    headingPos: number,
    headingLevel: number,
): HeadingFoldRange | null {
    const headingNode = doc.nodeAt(headingPos);
    if (!isHeadingNode(headingNode)) return null;

    const from = headingPos + headingNode.nodeSize;
    let to = doc.content.size;
    doc.forEach((node, offset) => {
        if (offset <= headingPos || !isHeadingNode(node)) return;
        if (getHeadingLevel(node) <= headingLevel && to === doc.content.size) {
            to = offset;
        }
    });

    return from < to ? { from, to } : null;
}

export function computeHeadingSignature(
    doc: ProseNode,
    folded?: ReadonlySet<number>,
): string {
    let sig = "";
    doc.forEach((node, offset) => {
        if (!isHeadingNode(node)) return;
        sig += `${offset}:${getHeadingLevel(node)}:${node.nodeSize}:${node.textContent};`;
    });
    if (folded) {
        sig += "|fold:";
        for (const pos of Array.from(folded).sort((a, b) => a - b)) sig += `${pos},`;
    }
    return sig;
}

export interface HeadingIndexEntry {

    pos: number;
    level: number;
    text: string;

    size: number;

    topLevel: boolean;

    foldRange: HeadingFoldRange | null;
}

export function buildHeadingIndex(doc: ProseNode): HeadingIndexEntry[] {
    const ranges = computeAllHeadingFoldRanges(doc);
    const entries: HeadingIndexEntry[] = [];
    doc.descendants((node, pos) => {
        if (!isHeadingNode(node)) return;
        const topLevel = doc.resolve(pos + 1).depth === 1;
        entries.push({
            pos,
            level: getHeadingLevel(node),
            text: node.textContent,
            size: node.nodeSize,
            topLevel,
            foldRange: topLevel ? (ranges.get(pos) ?? null) : null,
        });
    });
    return entries;
}

export function computeAllHeadingSignature(doc: ProseNode): string {
    let sig = "";
    doc.descendants((node, pos) => {
        if (!isHeadingNode(node)) return;
        sig += `${pos}:${getHeadingLevel(node)}:${node.nodeSize}:${node.textContent};`;
    });
    return sig;
}

export function computeAllHeadingFoldRanges(
    doc: ProseNode,
): Map<number, HeadingFoldRange | null> {
    const ranges = new Map<number, HeadingFoldRange | null>();
    const stack: { pos: number; level: number; size: number }[] = [];

    doc.forEach((node, offset) => {
        if (!isHeadingNode(node)) return;
        const level = getHeadingLevel(node);
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            const top = stack.pop()!;
            const from = top.pos + top.size;
            ranges.set(top.pos, from < offset ? { from, to: offset } : null);
        }
        stack.push({ pos: offset, level, size: node.nodeSize });
    });

    for (const top of stack) {
        const to = doc.content.size;
        const from = top.pos + top.size;
        ranges.set(top.pos, from < to ? { from, to } : null);
    }
    return ranges;
}
