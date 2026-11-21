
export const DEFAULT_TOPBAR_HEIGHT = 40;


export const VIEWPORT_PADDING = 8;


export const OPEN_URL_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);


export function extractUrlScheme(url: string): string {
    return url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1].toLowerCase() ?? "";
}


export const PATH_SUGGESTION_TIMEOUT_MS = 5000;


export const PATH_COMPLETE_DEBOUNCE_MS = 200;


export const PATH_COMPLETE_RETRIGGER_DELAY_MS = 50;


export const PATH_PREFIX_REGEX = /^(@\/|\.{1,2}\/|[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/)/;
