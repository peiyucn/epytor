

export interface ExternalChangeContext {
    latest: string;

    lastSaved: string | undefined;

    disk: string;

    webviewDirty: boolean;

    latestAuthoritative?: boolean;
}

export type ExternalChangeAction = "ignore" | "keepUserContent" | "adoptDisk" | "defer";

export interface ExternalChangeDecision {
    action: ExternalChangeAction;

    reason?: string;
}

export function decideExternalChange(ctx: ExternalChangeContext): ExternalChangeDecision {

    if (ctx.disk === ctx.latest) {
        return { action: "ignore" };
    }

    if (ctx.latestAuthoritative === false) {
        return { action: "defer", reason: "webview content unavailable" };
    }
    const wantsDisk = ctx.lastSaved !== undefined
        ? ctx.latest === ctx.lastSaved
        : !ctx.webviewDirty;
    return { action: wantsDisk ? "adoptDisk" : "keepUserContent" };
}

export function shouldSkipSave(input: {

    content: string;

    lastSaved: string | undefined;

    diskText: string;
}): boolean {
    if (input.lastSaved === undefined) { return false; }

    if (input.content !== input.lastSaved) { return false; }

    return input.diskText !== input.content;
}
