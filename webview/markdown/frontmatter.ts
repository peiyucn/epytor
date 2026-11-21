

export interface FrontmatterRow {
    key: string;
    value: string;
}


export type FrontmatterEntry =
    | { type: "kv"; key: string; value: string }
    | { type: "raw"; text: string };


const KV_LINE_RE = /^([^\s\-*#][^:]*):(.*)$/;


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

    }
    if (!hasKv) return "";
    return `---\n${lines.join("\n")}\n---\n`;
}
