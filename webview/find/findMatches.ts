/**
 * Text matching for the find bar (pure, unit-testable).
 * Plain mode: literal matching with an optional case-insensitive fold. Regex mode:
 * JavaScript RegExp (g / gi) with zero-width protection and invalid-pattern feedback.
 */
export interface TextMatch {
    start: number;
    end: number;
}

export interface FindMatchesOptions {
    caseSensitive: boolean;
    useRegex: boolean;
}

export interface FindMatchesResult {
    matches: TextMatch[];
    /** True when regex mode got an unparsable pattern (always false in plain mode). */
    invalidRegex: boolean;
    /** Hit the cap and stopped early (real match count >= cap). */
    truncated: boolean;
}

/** Collection cap per search; prevents pathological regexes from freezing the main thread. */
export const MAX_MATCHES = 5000;

export function findMatches(
    text: string,
    query: string,
    options: FindMatchesOptions,
): FindMatchesResult {
    if (!query) {
        return { matches: [], invalidRegex: false, truncated: false };
    }

    if (options.useRegex) {
        let re: RegExp;
        try {
            re = new RegExp(query, options.caseSensitive ? "g" : "gi");
        } catch {
            return { matches: [], invalidRegex: true, truncated: false };
        }
        const matches: TextMatch[] = [];
        let truncated = false;
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
            matches.push({ start: m.index, end: m.index + m[0].length });
            if (matches.length >= MAX_MATCHES) {
                truncated = true;
                break;
            }
            // Zero-width match (`.*`, `a*`): advance manually or exec loops forever.
            if (m[0].length === 0) {
                re.lastIndex = m.index + 1;
            }
        }
        return { matches, invalidRegex: false, truncated };
    }

    const q = options.caseSensitive ? query : query.toLowerCase();
    const t = options.caseSensitive ? text : text.toLowerCase();
    const matches: TextMatch[] = [];
    let truncated = false;
    let idx = 0;
    while (idx < t.length) {
        const found = t.indexOf(q, idx);
        if (found === -1) break;
        matches.push({ start: found, end: found + query.length });
        if (matches.length >= MAX_MATCHES) {
            truncated = true;
            break;
        }
        idx = found + 1;
    }
    return { matches, invalidRegex: false, truncated };
}
