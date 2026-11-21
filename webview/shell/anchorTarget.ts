
function safeDecodeURIComponent(value: string): string | null {
    try {
        return decodeURIComponent(value);
    } catch {

        return null;
    }
}


export function anchorIdCandidates(fragment: string): string[] {
    if (fragment.length === 0) { return []; }
    const decoded = safeDecodeURIComponent(fragment);
    if (decoded === null || decoded === fragment) { return [fragment]; }
    return [fragment, decoded];
}
