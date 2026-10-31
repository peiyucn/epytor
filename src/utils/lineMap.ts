/**
 * Line ranges of rendered blocks, for scroll sync and go-to-line. They must line up one-to-one
 * with the editor's top-level blocks (webview blocks follow `view.state.doc` child order), so an
 * offset shifts sync for every later block. Ranges come from the same remark+GFM+math parse as
 * the renderer; the old blank-line scan made a spaced list one block per item (142 DOM blocks vs
 * 232 entries in a 554-line file).
 * Regression: source→preview jumps landed in the wrong block.
 */
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export interface LineRange {
    start: number;
    end: number;
}

/** Minimal mdast shape; avoids depending on @types/mdast. */
interface MdastTopLevelNode {
    type: string;
    position?: { start: { line: number }; end: { line: number } };
}

/** Top-level node types that render no editor block; keeping them would shift every index. */
const NON_RENDERED_NODE_TYPES = new Set(["definition", "footnoteDefinition", "yaml", "toml"]);

/** Same parser and extensions as the renderer (GFM tables/task lists, $..$ math). */
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

/** Cache: unchanged-content saves re-request the map, and a large document parses in ~100ms. */
let cachedContent: string | undefined;
let cachedRanges: LineRange[] = [];

/** 1-indexed closed ranges, in mdast top-level node order. */
export function computeLineRanges(content: string): LineRange[] {
    if (content === cachedContent) { return cachedRanges; }
    const tree = parser.parse(content) as unknown as { children: MdastTopLevelNode[] };
    const ranges: LineRange[] = [];
    for (const node of tree.children) {
        if (NON_RENDERED_NODE_TYPES.has(node.type)) { continue; }
        const start = node.position?.start.line;
        const end = node.position?.end.line;
        if (start === undefined || end === undefined) { continue; }
        ranges.push({ start, end: Math.max(start, end) });
    }
    cachedContent = content;
    cachedRanges = ranges;
    return ranges;
}

/** Regex mirrors contentTransform.extractFrontmatter, so both agree on where the body starts. */
function splitFrontmatter(content: string): { frontmatterLines: number; body: string } {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (!match) return { frontmatterLines: 0, body: content };
    return { frontmatterLines: match[0].split("\n").length - 1, body: content.slice(match[0].length) };
}

/**
 * Display ranges: `ranges[i]` = source lines of the i-th body block. Frontmatter renders no
 * block, so it is skipped and its line count re-added; otherwise every index is off by one.
 */
export function computeDisplayLineRanges(content: string): LineRange[] {
    const { frontmatterLines, body } = splitFrontmatter(content);
    return computeLineRanges(body).map((range) => ({
        start: range.start + frontmatterLines,
        end: range.end + frontmatterLines,
    }));
}
