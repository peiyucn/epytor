/**
 * Apply layout CSS variables on the WebView side (jsdom-testable). Values take effect on
 * message, no reload; the Extension already sanitizes them, this is a second guard.
 */
const VAR_EDITOR_MAX_WIDTH = "--editor-max-width";
const VAR_CODE_BLOCK_MAX_HEIGHT = "--code-block-max-height";

function applyPxVar(name: string, value: number): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) { return; }
    document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
}

/** Max width of the editor content area (px). */
export function applyEditorMaxWidth(value: number): void {
    applyPxVar(VAR_EDITOR_MAX_WIDTH, value);
}

/** Max display height of a code block (px). */
export function applyCodeBlockMaxHeight(value: number): void {
    applyPxVar(VAR_CODE_BLOCK_MAX_HEIGHT, value);
}
