/**
 * Frontmatter parsing/serialization (pure, unit-testable). Only top-level `key: value`
 * lines are editable; all other lines are kept verbatim as raw entries, so panel editing
 * can never lose content that does not round-trip.
 */

export interface FrontmatterRow {
    key: string;
    value: string;
}

/** Ordered entries: kv = editable row; raw = preserved line (not editable, never dropped). */
export type FrontmatterEntry =
    | { type: "kv"; key: string; value: string }
    | { type: "raw"; text: string };

/** Top-level `key: value` lines safe to flatten: no leading whitespace, no `-`/`*`/`#` (YAML list items and comments stay raw). */
const KV_LINE_RE = /^([^\s\-*#][^:]*):(.*)$/;

/** Parse a YAML header into ordered entries (`---` separators skipped; trailing blank lines dropped, inner ones kept). */
export function parseFrontmatter(raw: string): FrontmatterEntry[] {
    const lines = raw.split("\n");
    while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
    const entries: FrontmatterEntry[] = [];
    for (const line of lines) {
        if (/^---/.test(line)) continue;
        const kv = KV_LINE_RE.exec(line);
        if (kv) {
            entries.push({ type: "kv", key: kv[1].trim(), value: kv[2].trim() });
        } else {
            entries.push({ type: "raw", text: line });
        }
    }
    return entries;
}

/** Serialize entries back into a full YAML header (with `---` fences and trailing newline); "" when no kv line remains. */
export function serializeFrontmatter(entries: FrontmatterEntry[]): string {
    const lines: string[] = [];
    let hasKv = false;
    for (const entry of entries) {
        if (entry.type === "raw") {
            lines.push(entry.text);
        } else if (entry.key.trim() !== "") {
            hasKv = true;
            const key = entry.key.trim();
            lines.push(entry.value !== "" ? `${key}: ${entry.value}` : `${key}:`);
        }
        // Empty keys are dropped; the panel already validates them.
    }
    if (!hasKv) return "";
    return `---\n${lines.join("\n")}\n---\n`;
}
