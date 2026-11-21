
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

export interface LineRange {
    start: number;
    end: number;
}

interface MdastTopLevelNode {
    type: string;
    position?: { start: { line: number }; end: { line: number } };
}

const NON_RENDERED_NODE_TYPES = new Set(["definition", "footnoteDefinition", "yaml", "toml"]);

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);

let cachedContent: string | undefined;
let cachedRanges: LineRange[] = [];

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

function splitFrontmatter(content: string): { frontmatterLines: number; body: string } {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (!match) return { frontmatterLines: 0, body: content };
    return { frontmatterLines: match[0].split("\n").length - 1, body: content.slice(match[0].length) };
}

export function computeDisplayLineRanges(content: string): LineRange[] {
    const { frontmatterLines, body } = splitFrontmatter(content);
    return computeLineRanges(body).map((range) => ({
        start: range.start + frontmatterLines,
        end: range.end + frontmatterLines,
    }));
}
