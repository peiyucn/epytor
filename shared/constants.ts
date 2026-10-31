/** Top bar height (px) before it can be measured; matches Crepe's default. */
export const DEFAULT_TOPBAR_HEIGHT = 40;

/** Margin (px) kept from the viewport edge when scrolling to a position. */
export const VIEWPORT_PADDING = 8;

/** URL scheme allowlist: anything else (file:, javascript:, custom) is refused. */
export const OPEN_URL_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);

/** Lowercase scheme of a URL ("https"), or "" when it is not in scheme form. */
export function extractUrlScheme(url: string): string {
    return url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1].toLowerCase() ?? "";
}

/** Path completion: request timeout; silence means give up, never revive the dropdown. */
export const PATH_SUGGESTION_TIMEOUT_MS = 5000;

/** Path completion: input debounce. */
export const PATH_COMPLETE_DEBOUNCE_MS = 200;

/** Path completion: delay before retriggering after picking a directory (let the input update). */
export const PATH_COMPLETE_RETRIGGER_DELAY_MS = 50;

/** Path completion prefixes (@/ , ./ , ../ , top-level dir/), shared by links and images. */
export const PATH_PREFIX_REGEX = /^(@\/|\.{1,2}\/|[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)/;
