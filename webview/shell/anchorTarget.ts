/**
 * Documentation anchor (`[text](#fragment)`) target resolution (pure, jsdom-testable).
 *
 * Heading ids are the raw heading text, but a link may carry the percent-encoded fragment;
 * querying with that form never matched, so the link silently did nothing (regression).
 * Candidates are therefore raw first, then decoded.
 */
function safeDecodeURIComponent(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {
        // Incomplete or invalid escapes (`#100%`, `#%E4`) are not encoded fragments.
        return null;
    }
}

/**
 * Candidate ids for a fragment, in match order and deduplicated; empty for an empty
 * fragment. No slug normalization: a GitHub slug (`Hello World!` -> `hello-world`) does
 * not match the id the editor installs (`hello-world!`), so guessing would create new
 * mismatches (see docs/tech-debt.md).
 */
export function anchorIdCandidates(fragment: string): string[] {
    if (fragment.length === 0) { return []; }
    const decoded = safeDecodeURIComponent(fragment);
    if (decoded === null || decoded === fragment) { return [fragment]; }
    return [fragment, decoded];
}
