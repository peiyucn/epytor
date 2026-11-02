/**
 * Word-style multilevel list markers (see
 * docs/specs/2026-09-12-word-style-multilevel-markers.md).
 *
 * Display only: the Markdown source stays `1.` / `-`. Levels cycle in three steps (Word's
 * default): ordered 1./a)/i., bullets filled circle/square/diamond. Computed in JS because
 * CSS has no per-level selector and numbering must honor the list start (`order`, e.g. a
 * list continued after a backspace).
 */

/** Three-step cycle: level n uses stop ((n-1) % 3). */
export const MARKER_LEVEL_CYCLE = 3;

export type MarkerKind = "ordered" | "bullet";

export interface ListMarker {
    /** 1..3, matching the bullet shapes and 1./a)/i. */
    level: number;
    /** Ordered display text including delimiter (`3.`, `a)`, `iv.`); null for bullets. */
    text: string | null;
    /** CSS shape of the bullet (written to a custom property). */
    bullet: { size: string; radius: string; rotate: string };
}

/**
 * Bullet shapes for the three levels, drawn as CSS (no font glyphs). Custom properties
 * instead of a level class: "level 3 and deeper" also matches level-4 items after the cycle
 * wraps (observed: level 4 still showed the level-3 diamond), while a custom property is
 * resolved from the nearest ancestor.
 */
const BULLET_SHAPES: Record<number, { size: string; radius: string; rotate: string }> = {
    1: { size: "6px", radius: "50%", rotate: "0deg" },   // filled circle
    2: { size: "5px", radius: "1px", rotate: "0deg" },   // filled square
    3: { size: "5px", radius: "1px", rotate: "45deg" },  // filled diamond
};

/** Lowercase roman numeral (1..3999; out of range falls back to decimal, never throws). */
export function toLowerRoman(value: number): string {
    if (!Number.isFinite(value) || value < 1 || value > 3999) { return String(value); }
    const table: Array<[number, string]> = [
        [1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"],
        [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"],
    ];
    let rest = Math.floor(value);
    let out = "";
    for (const [n, s] of table) {
        while (rest >= n) { out += s; rest -= n; }
    }
    return out;
}

/** Lowercase alphabetic ordinal (1 -> a, 26 -> z, 27 -> aa). */
export function toLowerAlpha(value: number): string {
    if (!Number.isFinite(value) || value < 1) { return String(value); }
    let rest = Math.floor(value);
    let out = "";
    while (rest > 0) {
        const rem = (rest - 1) % 26;
        out = String.fromCharCode(97 + rem) + out;
        rest = Math.floor((rest - 1) / 26);
    }
    return out;
}

/**
 * Marker to display for one item.
 *
 * @param kind Ordered or bullet (task items are excluded by the caller).
 * @param depth Nesting depth, from 1.
 * @param index Item index inside its list, from 0.
 * @param order Markdown start number of the list (default 1).
 */
export function computeListMarker(kind: MarkerKind, depth: number, index: number, order = 1): ListMarker {
    const level = ((Math.max(1, Math.floor(depth)) - 1) % MARKER_LEVEL_CYCLE) + 1;
    const bullet = BULLET_SHAPES[level];
    if (kind === "bullet") { return { level, text: null, bullet }; }
    const ordinal = Math.max(1, Math.floor(order)) + Math.max(0, Math.floor(index));
    if (level === 1) { return { level, text: `${ordinal}.`, bullet }; }
    if (level === 2) { return { level, text: `${toLowerAlpha(ordinal)})`, bullet }; }
    return { level, text: `${toLowerRoman(ordinal)}.`, bullet };
}
