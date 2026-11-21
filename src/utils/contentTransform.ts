


export function extractFrontmatter(content: string): { frontmatter: string; body: string } {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (match) {
        return { frontmatter: match[0], body: content.slice(match[0].length) };
    }
    return { frontmatter: "", body: content };
}


export function restoreContentForSave(
    content: string,
    frontmatter: string,
    uriMap: Map<string, string>,
): string {
    const full = frontmatter ? frontmatter + content : content;
    if (uriMap.size === 0) { return full; }
    return rewriteImageSources(full, (src) => uriMap.get(src) ?? uriMap.get(normalizeImageDestination(src)));
}


export function convertTableBrForDisplay(content: string): string {
    const lines = content.split("\n");
    let inFence = false;

    return lines
        .map((line) => {
            if (/^\s*(`{3,}|~{3,})/.test(line)) {
                inFence = !inFence;
                return line;
            }
            if (inFence) return line;
            if (/^\s*\|/.test(line) && /<br\s*\/?>/i.test(line)) {
                return line.replace(/<br\s*\/?>/gi, "&#10;");
            }
            return line;
        })
        .join("\n");
}


export function buildContentWithFrontmatter(
    currentContent: string,
    newFrontmatter: string,
    uriMap: Map<string, string>,
): string | null {
    const { body } = extractFrontmatter(currentContent);
    const newContent = restoreContentForSave(body, newFrontmatter, uriMap);
    return newContent === currentContent ? null : newContent;
}


const IMAGE_SYNTAX_RE = /!\[([^\]]*)\]\(([^()]*?(?:\([^()]*\)[^()]*?)*?)(?:\s+["']([^"']*)["'])?\)/g;


export function normalizeImageDestination(src: string): string {
    const inner = src.length > 2 && src.startsWith("<") && src.endsWith(">")
        ? src.slice(1, -1)
        : src;
    return inner.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}


export function rewriteImageSources(
    markdown: string,
    resolve: (src: string) => string | undefined,
): string {
    let result = "";
    let cursor = 0;
    for (const m of markdown.matchAll(IMAGE_SYNTAX_RE)) {
        const newSrc = resolve(m[2]);
        if (newSrc === undefined) { continue; }
        const prefix = `![${m[1]}](`;
        result += markdown.slice(cursor, m.index) + prefix + newSrc;
        cursor = m.index + prefix.length + m[2].length;
    }
    return result + markdown.slice(cursor);
}
