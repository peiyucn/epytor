export const MERMAID_ZOOM_MIN = 0.2;
export const MERMAID_ZOOM_MAX = 3;
export const MERMAID_ZOOM_STEP = 0.2;

/** Step the zoom, clamp to [MIN, MAX], and round to two decimals. */
export function clampZoom(current: number, delta: number): number {
    const next = Math.min(MERMAID_ZOOM_MAX, Math.max(MERMAID_ZOOM_MIN, current + delta));
    return Math.round(next * 100) / 100;
}
