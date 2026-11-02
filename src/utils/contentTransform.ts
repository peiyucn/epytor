/**
 * Pure markdown transforms shared by MarkdownEditorProvider and unit tests.
 * No vscode API here, so they run under plain Node.
 */

/** YAML frontmatter that starts the file; anything later is body text. */
export function extractFrontmatter(content: string): { frontmatter: string; body: string } {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
    if (match) {
        return { frontmatter: match[0], body: content.slice(match[0].length) };
    }
    return { frontmatter: "", body: content };
}

/**
 * Re-attach the frontmatter and map image `src` slices back to relative paths.
 * Regression: replacing every `webviewUri` occurrence also rewrote code fences and prose.
 */
export function restoreContentForSave(
    content: string,
    frontmatter: string,
    uriMap: Map<string, string>,
): string {
    const full = frontmatter ? frontmatter + content : content;
    if (uriMap.size === 0) { return full; }
    return rewriteImageSources(full, (src) => uriMap.get(src) ?? uriMap.get(normalizeImageDestination(src)));
}

/**
 * In table cells, `<br>` → `&#10;` before parsing: remark-gfm drops cell `<br>`
 * (upstream Milkdown#2463), while the entity parses to a `\n` text node that renders as a line
 * break and serializes back to `<br>`, so the source round-trips.
 */
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

/** Replace the YAML header, keep the body; null when nothing changes (caller skips the save). */
export function buildContentWithFrontmatter(
    currentContent: string,
    newFrontmatter: string,
    uriMap: Map<string, string>,
): string | null {
    const { body } = extractFrontmatter(currentContent);
    const newContent = restoreContentForSave(body, newFrontmatter, uriMap);
    return newContent === currentContent ? null : newContent;
}

/**
 * Image syntax: `src` may contain spaces and one nesting level of parens (Windows names like
 * "my file (v2).png"); an optional quoted title is captured separately.
 * Regression: a narrow `src` pattern truncated such paths (broken images, truncated uriMap keys),
 * and a greedy fix swallowed the title into `src`.
 */
const IMAGE_SYNTAX_RE = /!\[([^\]]*)\]\(([^()]*?(?:\([^()]*\)[^()]*?)*?)(?:\s+["']([^"']*)["'])?\)/g;

/**
 * Normalize an image destination for comparison: undo CommonMark escapes (`\(` → `(`) and the
 * `<...>` wrapper. mdast adds both for parens and spaces, and the raw spelling must neither leak
 * into the saved file nor miss its uriMap key — the map values keep the original spelling.
 */
export function normalizeImageDestination(src: string): string {
    const inner = src.length > 2 && src.startsWith("<") && src.endsWith(">")
        ? src.slice(1, -1)
        : src;
    return inner.replace(/\\([!-/:-@[-`{-~])/g, "$1");
}

/**
 * Single pass over image syntax: display (relative → webviewUri) and save (webviewUri → relative)
 * share this one replacement domain. Only the `src` slice is rewritten; alt and title keep their
 * original spelling and quoting.
 */
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
