/**
 * Clean Markdown serialization helpers.
 *
 * Milkdown delegates Markdown output to mdast-util-to-markdown, whose safety rules escape
 * more punctuation than we need (underscores inside identifiers). Structural characters
 * stay protected; only known false positives are relaxed, still through the upstream
 * context-aware `safe`.
 */

type UnsafePattern = {
    character?: string;
    atBreak?: boolean | null;
};

type SafeConfig = {
    before: string;
    after: string;
    encode?: string[];
};

export type MarkdownTextNode = { value: string };
export type MarkdownTextParent = { type?: string } | undefined;

export type MarkdownTextState = {
    unsafe: UnsafePattern[];
    safe(input: string | null | undefined, config: SafeConfig): string;
};

export type MarkdownTextInfo = SafeConfig;

export type SerializationMode = "clean" | "compatible";

export type CleanTextHandler = (
    node: MarkdownTextNode,
    parent: MarkdownTextParent,
    state: MarkdownTextState,
    info: MarkdownTextInfo,
) => string;

const RELAXABLE_CHARACTERS = new Set(["_", "*", "["]);
const PROTECTED_LINK_PARENTS = new Set([
    "link",
    "image",
    "linkReference",
    "imageReference",
]);

function isTechnicalToken(value: string): boolean {
    return /^[A-Za-z0-9_.$:/@+\-[\]]+$/.test(value);
}

function hasAttentionPair(value: string, marker: "_" | "*"): boolean {
    // A token such as __init__ is an identifier, not an emphasis phrase.
    if (isTechnicalToken(value)) return false;

    const escapedMarker = marker === "*" ? "\\*" : "_";
    const pattern = new RegExp(
        `(?:^|[\\s([{"'])${escapedMarker}{1,2}(?=\\S)[^${marker}\\n]+?\\S${escapedMarker}{1,2}(?=$|[\\s)\\]}.,!?;:'"])`,
    );
    return pattern.test(value);
}

function hasLinkLikeSyntax(value: string): boolean {
    return /!?\[[^\]\n]*\]\s*(?:\(|\[)/.test(value);
}

function shouldPreserveRelaxedCharacter(
    value: string,
    character: string,
    parent: MarkdownTextParent,
): boolean {
    if (character === "_" || character === "*") {
        return hasAttentionPair(value, character);
    }

    if (character === "[") {
        return (
            (parent?.type !== undefined && PROTECTED_LINK_PARENTS.has(parent.type)) ||
            hasLinkLikeSyntax(value)
        );
    }

    return true;
}

/** Serialize a text node with Milkdown's safety algorithm, dropping only redundant `_`/`*`/`[` escapes. */
export const cleanTextHandler: CleanTextHandler = (node, parent, state, info) => {
    const value = node.value;
    if (/^[^*_\\]*\s+$/.test(value)) return value;

    const originalUnsafe = state.unsafe;
    const preserve = new Set<string>();
    for (const character of RELAXABLE_CHARACTERS) {
        if (shouldPreserveRelaxedCharacter(value, character, parent)) {
            preserve.add(character);
        }
    }

    state.unsafe = originalUnsafe.filter((pattern) => {
        const character = pattern.character;
        if (!character || !RELAXABLE_CHARACTERS.has(character)) return true;
        // Structural forms at the start of a line stay protected.
        if (pattern.atBreak) return true;
        return preserve.has(character);
    });

    try {
        return state.safe(value, { ...info, encode: [] });
    } finally {
        state.unsafe = originalUnsafe;
    }
};

/** Keep the file's existing table break spelling when Clean output adds a break to a changed row. */
export function preserveTableBreakStyle(source: string, serialized: string): string {
    const sourceStyle = source.match(/<br\s*\/?>/i)?.[0];
    if (!sourceStyle) return serialized;
    return serialized.replace(/<br\s*\/?>/gi, sourceStyle);
}

/** Bullet character and ordered delimiter, mirroring mdast-util-to-markdown options. */
export interface ListMarkerStyle {
    bullet: "*" | "-" | "+";
    ordered: "." | ")";
}

/**
 * Whole-line placeholder for an empty list item (`- <br />`, `- [ ] <br />`): added by
 * preset-commonmark so blank lines survive a round trip, removed again by the loader —
 * never user content.
 */
const LIST_ITEM_BREAK_PLACEHOLDER_RE =
    /^([ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?[ \t]*)<br\s*\/?>[ \t]*$/gim;

/**
 * Strip the empty-item placeholder from serialized text, keeping the marker.
 * Regression: removing the placeholder earlier also removed the task checkbox
 * (`- [ ] ` became `-`); doing it here keeps the marker that was just written.
 */
export function stripListItemBreakPlaceholder(markdown: string): string {
    return markdown.replace(LIST_ITEM_BREAK_PLACEHOLDER_RE, "$1");
}

/** The file's habitual line ending. */
export type LineEnding = "\r\n" | "\n";

/**
 * Pick the source's dominant line ending (majority; ties and no newlines = LF).
 * Regression: saves write raw bytes while serialization always returns LF, so CRLF files
 * were converted on every save.
 */
export function detectLineEnding(source: string): LineEnding {
    const crlf = (source.match(/\r\n/g) ?? []).length;
    const lf = (source.match(/\n/g) ?? []).length - crlf;
    return crlf > lf ? "\r\n" : "\n";
}

/** Normalize to LF for comparison and serialization (also lone `\r`). */
export function toLf(text: string): string {
    return text.replace(/\r\n?/g, "\n");
}

/** Write with the target line ending; input already `\r\n` is not doubled. */
export function withLineEnding(text: string, eol: LineEnding): string {
    return eol === "\n" ? text : text.replace(/\r\n?|\n/g, "\r\n");
}

/** Character-reference form (`&amp;` / `&#123;`), the only case needing an escaped `&`. */
const ENTITY_LIKE_AFTER_AMPERSAND_RE = /^(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#[xX][0-9A-Fa-f]+);/;

/**
 * Drop redundant `\&` escapes.
 * Regression: the serializer wrote `\&` inside link targets (`?a=1&b=2`), rewording user
 * files and polluting diffs. Only `&` before a character reference needs the escape; this
 * is fidelity, not rendering (CommonMark unescapes).
 */
export function dropRedundantAmpersandEscapes(markdown: string): string {
    return markdown.replace(/\\&/g, (match, offset: number, whole: string) =>
        ENTITY_LIKE_AFTER_AMPERSAND_RE.test(whole.slice(offset + 2)) ? match : "&",
    );
}

/** Line-leading list marker: `-`/`*`/`+` followed by a space (so `---` and setext `-` do not count). */
const LIST_MARKER_LINE_RE = /^[ \t]*([-*+]|\d{1,9}([.)]))[ \t]+/;

/**
 * Read the file's own list marker style so serialization can keep it.
 * Regression: the upstream default rewrites `- item` to `* item` and `1) item` to
 * `1. item` on every save. Majority wins; no list at all falls back to the upstream default.
 */
export function detectListMarkerStyle(source: string): ListMarkerStyle {
    const bullets: Array<"*" | "-" | "+"> = ["*", "-", "+"];
    const orderedMarkers: Array<"." | ")"> = [".", ")"];
    const bulletCounts = new Map<string, number>();
    const orderedCounts = new Map<string, number>();

    for (const line of source.split("\n")) {
        const match = LIST_MARKER_LINE_RE.exec(line);
        if (!match) { continue; }
        const delimiter = match[2];
        const counts = delimiter ? orderedCounts : bulletCounts;
        const marker = delimiter ?? match[1];
        counts.set(marker, (counts.get(marker) ?? 0) + 1);
    }

    return {
        bullet: mostFrequent(bullets, bulletCounts),
        ordered: mostFrequent(orderedMarkers, orderedCounts),
    };
}

/** Most frequent marker; with all counts zero the first candidate (= upstream default) wins. */
function mostFrequent<T extends string>(candidates: readonly T[], counts: Map<string, number>): T {
    let best = candidates[0];
    let bestCount = counts.get(best) ?? 0;
    for (const candidate of candidates.slice(1)) {
        const count = counts.get(candidate) ?? 0;
        if (count > bestCount) {
            best = candidate;
            bestCount = count;
        }
    }
    return best;
}

/**
 * Serialize table breaks as `<br>`.
 *
 * The default break handler degrades to a space inside a table. GFM's spelling is `<br>`,
 * but remark-gfm drops table `<br>` (upstream Milkdown#2463), so the Extension converts
 * source `<br>` to `&#10;` before parsing and this handler writes `<br>` back — a loop
 * GitHub also renders as a line break.
 *
 * Regression P5: display placeholders used to be scrubbed by a post-serialization
 * full-file scan; both sources (empty-cell placeholder appended for an empty paragraph,
 * and a trailing break the loader trims) are handled in place here.
 */
export function withTableBreakHandler<T extends { handlers?: unknown }>(options: T): T {
    const handlers = (options.handlers ?? {}) as Record<string, unknown>;
    const defaultBreak = handlers.break;
    const defaultText = handlers.text;
    return {
        ...options,
        handlers: {
            ...handlers,
            break: (
                node: unknown,
                parent: unknown,
                state: { stack: string[] },
                info: unknown,
            ) => {
                if (state.stack.includes("tableCell")) {
                    const siblings = (parent as { children?: unknown[] } | undefined)?.children;
                    if (Array.isArray(siblings) && siblings[siblings.length - 1] === node) {
                        return ""; // trailing break in a cell: reload trims it anyway
                    }
                    return "<br>";
                }
                const fallback = defaultBreak as
                    | ((n: unknown, p: unknown, s: unknown, i: unknown) => unknown)
                    | undefined;
                return fallback ? fallback(node, parent, state, info) : "";
            },
            // A hardbreak loaded from `&#10;` serializes as text containing `\n`; inside a
            // table it must become `<br>` or the bare newline breaks the table.
            text: (
                node: { value?: string },
                parent: unknown,
                state: { stack: string[] },
                info: unknown,
            ) => {
                if (state.stack.includes("tableCell") && String(node.value ?? "").includes("\n")) {
                    return String(node.value ?? "").replace(/\n/g, "<br>");
                }
                const fallback = defaultText as
                    | ((n: unknown, p: unknown, s: unknown, i: unknown) => unknown)
                    | undefined;
                return fallback ? fallback(node, parent, state, info) : String(node.value ?? "");
            },
            html: (
                node: { value?: string },
                _parent: unknown,
                state: { stack: string[] },
            ) => {
                const value = String(node.value ?? "");
                if (state.stack.includes("tableCell") && /^<br\s*\/?>$/i.test(value.trim())) {
                    return "";
                }
                // Do not swallow the list-item placeholder here: mdast needs it to emit the
                // checkbox. stripListItemBreakPlaceholder removes it after the marker is written.
                return value;
            },
        } as T["handlers"],
    };
}
