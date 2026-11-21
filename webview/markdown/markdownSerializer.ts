

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

        if (pattern.atBreak) return true;
        return preserve.has(character);
    });

    try {
        return state.safe(value, { ...info, encode: [] });
    } finally {
        state.unsafe = originalUnsafe;
    }
};


export function preserveTableBreakStyle(source: string, serialized: string): string {
    const sourceStyle = source.match(/<br\s*\/?>/i)?.[0];
    if (!sourceStyle) return serialized;
    return serialized.replace(/<br\s*\/?>/gi, sourceStyle);
}


export interface ListMarkerStyle {
    bullet: "*" | "-" | "+";
    ordered: "." | ")";
}


const LIST_ITEM_BREAK_PLACEHOLDER_RE =
    /^([ \t]*(?:[-*+]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?[ \t]*)<br\s*\/?>[ \t]*$/gim;


export function stripListItemBreakPlaceholder(markdown: string): string {
    return markdown.replace(LIST_ITEM_BREAK_PLACEHOLDER_RE, "$1");
}


export type LineEnding = "\r\n" | "\n";


export function detectLineEnding(source: string): LineEnding {
    const crlf = (source.match(/\r\n/g) ?? []).length;
    const lf = (source.match(/\n/g) ?? []).length - crlf;
    return crlf > lf ? "\r\n" : "\n";
}


export function toLf(text: string): string {
    return text.replace(/\r\n?/g, "\n");
}


export function withLineEnding(text: string, eol: LineEnding): string {
    return eol === "\n" ? text : text.replace(/\r\n?|\n/g, "\r\n");
}


const ENTITY_LIKE_AFTER_AMPERSAND_RE = /^(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#[xX][0-9A-Fa-f]+);/;


export function dropRedundantAmpersandEscapes(markdown: string): string {
    return markdown.replace(/\\&/g, (match, offset: number, whole: string) =>
        ENTITY_LIKE_AFTER_AMPERSAND_RE.test(whole.slice(offset + 2)) ? match : "&",
    );
}


const LIST_MARKER_LINE_RE = /^[ \t]*([-*+]|\d{1,9}([.)]))[ \t]+/;


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
                        return "";
                    }
                    return "<br>";
                }
                const fallback = defaultBreak as
                    | ((n: unknown, p: unknown, s: unknown, i: unknown) => unknown)
                    | undefined;
                return fallback ? fallback(node, parent, state, info) : "";
            },


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


                return value;
            },
        } as T["handlers"],
    };
}
