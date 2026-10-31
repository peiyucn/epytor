/**
 * Sanitize configuration values before they are interpolated into the webview HTML
 * (pure, unit-tested).
 *
 * Workspace-level settings travel with a cloned repo and are untrusted: an unsanitized value
 * could escape `<style>` or the inline `<script>` and inject markup (phishing UI, CSS beacons).
 */

export const DEFAULT_CODE_BLOCK_MAX_HEIGHT = 600;
export const DEFAULT_EDITOR_MAX_WIDTH = 900;
/** Out-of-range values fall back to the default; aligned with the schema minimums. */
export const MIN_CODE_BLOCK_MAX_HEIGHT = 100;
export const MIN_EDITOR_MAX_WIDTH = 400;
/** Aligned with the schema maximum. */
const MAX_CSS_NUMBER = 10_000;

/** Finite number within [min, max], otherwise `fallback`. */
export function sanitizeCssNumber(
    value: unknown,
    fallback: number,
    min = 1,
    max = MAX_CSS_NUMBER,
): number {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        return fallback;
    }
    return Math.round(value);
}

/** Whitelist, so the value cannot break out of the inline script JSON. */
export function sanitizeSerializationMode(value: unknown): "clean" | "compatible" {
    return value === "compatible" ? "compatible" : "clean";
}
