/**
 * Parse persisted editor state (the selection part of webview state).
 *
 * Regression: a full webview reload lost the caret to 1:1 because the position only
 * lived in ProseMirror state. The last text selection is persisted and restored after
 * rebuild (editor.ts restoreSavedSelection).
 */

import type { TextSelectionRange } from "./rebuildRestore";

/**
 * Validate a persisted selection: non-negative integers only, reversed ranges swapped,
 * anything else null so the caller treats it as "no snapshot" instead of applying garbage.
 */
export function parseSavedSelection(raw: unknown): TextSelectionRange | null {
    if (typeof raw !== "object" || raw === null) { return null; }
    const { from, to } = raw as { from?: unknown; to?: unknown };
    if (typeof from !== "number" || typeof to !== "number") { return null; }
    if (!Number.isInteger(from) || !Number.isInteger(to)) { return null; }
    if (from < 0 || to < 0) { return null; }
    return from <= to ? { from, to } : { from: to, to: from };
}
