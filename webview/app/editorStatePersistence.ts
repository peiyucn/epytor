

import type { TextSelectionRange } from "./rebuildRestore";

export function parseSavedSelection(raw: unknown): TextSelectionRange | null {
    if (typeof raw !== "object" || raw === null) { return null; }
    const { from, to } = raw as { from?: unknown; to?: unknown };
    if (typeof from !== "number" || typeof to !== "number") { return null; }
    if (!Number.isInteger(from) || !Number.isInteger(to)) { return null; }
    if (from < 0 || to < 0) { return null; }
    return from <= to ? { from, to } : { from: to, to: from };
}
