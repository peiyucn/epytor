/** Heading folding logic (pure, unit-testable). */
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

/**
 * Fold range of a heading: from its end to the next heading of level <= its own, or
 * the end of the document. Null when there is nothing to fold.
 */
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

/**
 * Top-level heading signature (`pos:level:size:text;...` plus optional fold state),
 * used to decide whether fold decorations / TOC must be rebuilt. Typing body text
 * leaves it unchanged, skipping the O(n) rebuild entirely.
 * Only top-level headings: fold decorations only apply there. Use
 * computeAllHeadingSignature when nested headings matter.
 */
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

/** Heading index entry; fold, sticky and TOC share this enumeration and identity. */
export interface HeadingIndexEntry {
    /** Node start position (= fold state key = doc.forEach offset). */
    pos: number;
    level: number;
    text: string;
    /** Node size, for fold ranges and decoration ranges. */
    size: number;
    /** Top-level heading (parent is doc): folding and sticky rows only handle these. */
    topLevel: boolean;
    /** Fold range (top-level only; null when no following block or no content). */
    foldRange: HeadingFoldRange | null;
}

/**
 * Build the heading index in one pass, including nested headings; top-level ones also
 * get their fold range.
 *
 * Top-level detection uses `resolve(pos + 1)` because the position must be inside the
 * node: testing `pos` itself yields depth 0, one off from sticky's
 * `posAtDOM(element, 0)` (element start + 1), which caused two regressions.
 */
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

/**
 * Signature of all headings, nested included (TOC refresh test).
 * Regression P1: reusing the top-level-only signature meant edits inside nested
 * headings (blockquotes, lists) left the signature unchanged and the TOC went stale.
 */
export function computeAllHeadingSignature(doc: ProseNode): string {
    let sig = "";
    doc.descendants((node, pos) => {
        if (!isHeadingNode(node)) return;
        sig += `${pos}:${getHeadingLevel(node)}:${node.nodeSize}:${node.textContent};`;
    });
    return sig;
}

/**
 * All heading fold ranges in one pass (O(n)).
 * Regression: calling findHeadingFoldRange per heading rescanned the whole document,
 * taking ~315ms per keystroke on a 10k-line doc (jsdom). Stack algorithm with the same
 * semantics: a heading closes every pending heading of level >= its own.
 */
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
