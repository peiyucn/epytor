/**
 * Status-bar file size (pure, unit-tested).
 *
 * Shows the on-disk byte count, not the editor buffer: AI tooling moves the file on disk and
 * users cross-check it against Explorer. Base 1024, one decimal — a stable digit count keeps
 * the neighbouring status items from jittering.
 */

const KB = 1024;
const MB = KB * KB;

/**
 * `null` for missing or invalid input, so the caller omits the segment rather than showing
 * `0 B` or `?`, which would read as an empty file.
 */
export function formatFileSize(bytes: number | undefined | null): string | null {
    if (bytes === undefined || bytes === null) { return null; }
    if (typeof bytes !== "number" || !Number.isFinite(bytes)) { return null; }
    if (bytes < 0) { return null; }
    // stat() yields integers; floor keeps a fractional caller value from producing "12.5 B".
    const size = Math.floor(bytes);
    if (size < KB) { return `${size} B`; }
    if (size < MB) { return `${(size / KB).toFixed(1)} KB`; }
    return `${(size / MB).toFixed(1)} MB`;
}

/**
 * Join the word-count segment and the optional size segment. Pure so the layout rules — omit an
 * unknown size, two-space separator, `Size: {0}` label injected by the caller — stay testable
 * without `vscode.window.createStatusBarItem`.
 */
export function composeStatusBarText(
    base: string,
    size: string | null,
    sizeLabel: (size: string) => string,
): string {
    if (size === null) { return base; }
    return `${base}  ${sizeLabel(size)}`;
}
