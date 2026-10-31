/** Table wrapping styles shared by Extension (Node) and WebView (Browser). */
export type TableWrapMode = "wrap" | "nowrap";

/**
 * Coerce a raw config value into a supported mode.
 *
 * Cross-boundary values are untyped (config JSON, message payloads), so callers used to string
 * through arbitrary text and each consumer had to re-lean on `resolveTableWrapVars`' default.
 * Normalizing at the boundary keeps the message type honest. Legacy `"none"` means nowrap.
 */
export function normalizeTableWrapMode(value: unknown): TableWrapMode {
    return value === "nowrap" || value === "none" ? "nowrap" : "wrap";
}

export interface TableWrapVars {
    /** th/td word-break. */
    wordBreak: "keep-all" | "break-all";
    /** th/td white-space. */
    whiteSpace: "normal" | "nowrap";
    /** overflow-x of the scroll container; nowrap lets the table overflow horizontally. */
    overflowX: "visible" | "auto";
    /** table width; `max-content` lets content widen the table and trigger scrolling. */
    tableWidth: "auto" | "max-content";
}

/**
 * Two modes (user decision 2026-09-07, reduced from three):
 * wrap = break anywhere (long URLs/code), nowrap = no wrap + horizontal scroll.
 * Legacy values: "none" maps to nowrap, everything else to wrap.
 */
export function resolveTableWrapVars(mode: string): TableWrapVars {
    switch (mode) {
        case "nowrap":
        case "none":
            return { wordBreak: "keep-all", whiteSpace: "nowrap", overflowX: "auto", tableWidth: "max-content" };
        default:
            return { wordBreak: "break-all", whiteSpace: "normal", overflowX: "visible", tableWidth: "auto" };
    }
}
