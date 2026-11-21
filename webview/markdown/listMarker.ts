


export const MARKER_LEVEL_CYCLE = 3;

export type MarkerKind = "ordered" | "bullet";

export interface ListMarker {

    level: number;

    text: string | null;

    bullet: { size: string; radius: string; rotate: string };
}


const BULLET_SHAPES: Record<number, { size: string; radius: string; rotate: string }> = {
    1: { size: "6px", radius: "50%", rotate: "0deg" },
    2: { size: "5px", radius: "1px", rotate: "0deg" },
    3: { size: "5px", radius: "1px", rotate: "45deg" },
};


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


export function computeListMarker(kind: MarkerKind, depth: number, index: number, order = 1): ListMarker {
    const level = ((Math.max(1, Math.floor(depth)) - 1) % MARKER_LEVEL_CYCLE) + 1;
    const bullet = BULLET_SHAPES[level];
    if (kind === "bullet") { return { level, text: null, bullet }; }
    const ordinal = Math.max(1, Math.floor(order)) + Math.max(0, Math.floor(index));
    if (level === 1) { return { level, text: `${ordinal}.`, bullet }; }
    if (level === 2) { return { level, text: `${toLowerAlpha(ordinal)})`, bullet }; }
    return { level, text: `${toLowerRoman(ordinal)}.`, bullet };
}
