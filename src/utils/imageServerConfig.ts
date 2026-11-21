
import type * as vscode from "vscode";

export const DEFAULT_IMAGE_SERVER_FIELD_NAME = "file";
export const DEFAULT_IMAGE_SERVER_RESPONSE_PATH = "url";

export const IMAGE_SERVER_FIELD_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

export interface ImageServerSettings {
    url: string;
    fieldName: string;
    extraParams: Record<string, string>;
    responsePath: string;
}


interface LegacyImageServerSettings {
    url?: unknown;
    fieldName?: unknown;
    extraParams?: unknown;
    responsePath?: unknown;
}

type ImageServerIssueKind =
    | "settingsNotObject"
    | "extraParamsNotObject"
    | "extraParamsInvalidJson"
    | "extraParamsUnsupportedValue";


export interface ImageServerIssue {
    kind: ImageServerIssueKind;

    keys?: string[];
}

interface ImageServerResolution {
    settings: ImageServerSettings;
    issues: ImageServerIssue[];
}


interface LocalizableIssueMessage {
    message: string;
    args: string[];
}


export function describeImageServerIssue(issue: ImageServerIssue): LocalizableIssueMessage {
    switch (issue.kind) {
        case "settingsNotObject":
            return {
                message: "epytor.imageServer must be an object; the deprecated epytor.imageServer* settings are used instead",
                args: [],
            };
        case "extraParamsNotObject":
            return {
                message: "epytor.imageServer.extraParams must be a JSON object and was ignored",
                args: [],
            };
        case "extraParamsInvalidJson":
            return {
                message: "epytor.imageServerExtraParams is not valid JSON and was ignored",
                args: [],
            };
        case "extraParamsUnsupportedValue":
            return {
                message: "Only strings, numbers and booleans are supported in epytor.imageServer.extraParams (nested objects and arrays are not); ignored keys: {0}",
                args: [(issue.keys ?? []).join(", ")],
            };
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}


export function sanitizeMultipartText(value: string): string {
    return value.replace(/[\r\n"]/g, "").trim();
}


function firstValid<T>(
    candidates: unknown[],
    normalize: (value: unknown) => T | undefined,
    fallback: T,
): T {
    for (const candidate of candidates) {
        const value = normalize(candidate);
        if (value !== undefined) { return value; }
    }
    return fallback;
}

function normalizeNonEmptyText(value: unknown): string | undefined {
    if (typeof value !== "string") { return undefined; }
    const trimmed = value.trim();
    return trimmed === "" ? undefined : trimmed;
}

function normalizeFieldName(value: unknown): string | undefined {
    if (typeof value !== "string") { return undefined; }
    const trimmed = value.trim();
    return IMAGE_SERVER_FIELD_NAME_PATTERN.test(trimmed) ? trimmed : undefined;
}


function normalizeParamValue(value: unknown): string | undefined {
    if (typeof value === "string") { return sanitizeMultipartText(value); }
    if (typeof value === "number" && Number.isFinite(value)) { return String(value); }
    if (typeof value === "boolean") { return String(value); }
    return undefined;
}

function normalizeExtraParams(input: unknown): {
    params: Record<string, string>;
    issues: ImageServerIssue[];
} {
    if (!isPlainObject(input)) {
        return { params: {}, issues: [{ kind: "extraParamsNotObject" }] };
    }
    const params: Record<string, string> = {};
    const unsupported: string[] = [];
    for (const [rawKey, rawValue] of Object.entries(input)) {
        const key = sanitizeMultipartText(rawKey);
        const value = normalizeParamValue(rawValue);
        if (key === "" || value === undefined) {
            unsupported.push(rawKey);
            continue;
        }
        params[key] = value;
    }
    return {
        params,
        issues: unsupported.length > 0
            ? [{ kind: "extraParamsUnsupportedValue", keys: unsupported }]
            : [],
    };
}


function parseLegacyExtraParams(raw: unknown): {
    params: Record<string, string>;
    issues: ImageServerIssue[];
} {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (text === "") { return { params: {}, issues: [] }; }
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return { params: {}, issues: [{ kind: "extraParamsInvalidJson" }] };
    }
    return normalizeExtraParams(parsed);
}


export function resolveImageServerConfig(
    server: unknown,
    legacy: LegacyImageServerSettings = {},
): ImageServerResolution {
    const issues: ImageServerIssue[] = [];
    let obj: Record<string, unknown> | undefined;
    if (server === undefined || server === null) {
        obj = undefined;
    } else if (isPlainObject(server)) {
        obj = server;
    } else {
        issues.push({ kind: "settingsNotObject" });
        obj = undefined;
    }

    const url = firstValid([obj?.["url"], legacy.url], normalizeNonEmptyText, "");
    const fieldName = firstValid(
        [obj?.["fieldName"], legacy.fieldName],
        normalizeFieldName,
        DEFAULT_IMAGE_SERVER_FIELD_NAME,
    );
    const responsePath = firstValid(
        [obj?.["responsePath"], legacy.responsePath],
        normalizeNonEmptyText,
        DEFAULT_IMAGE_SERVER_RESPONSE_PATH,
    );

    let extra: { params: Record<string, string>; issues: ImageServerIssue[] };
    if (obj !== undefined && obj["extraParams"] !== undefined) {
        extra = normalizeExtraParams(obj["extraParams"]);
    } else {
        extra = parseLegacyExtraParams(legacy.extraParams);
    }
    issues.push(...extra.issues);

    return { settings: { url, fieldName, extraParams: extra.params, responsePath }, issues };
}


interface ServerStorageOrigin {

    storageFromWorkspace: boolean;

    urlFromWorkspace: boolean;
}


export function readServerStorageOrigin(
    cfg: Pick<vscode.WorkspaceConfiguration, "inspect">,
    effectiveUrl: string,
): ServerStorageOrigin {
    const storageInspect = cfg.inspect?.("imageStorage");
    const storageFromWorkspace =
        storageInspect?.workspaceValue !== undefined ||
        storageInspect?.workspaceFolderValue !== undefined;

    const candidates: unknown[] = [];
    for (const section of ["imageServer", "imageServerUrl"]) {
        const inspect = cfg.inspect?.(section);
        if (!inspect) { continue; }
        for (const value of [inspect.workspaceFolderValue, inspect.workspaceValue]) {
            if (section === "imageServer") {
                if (isPlainObject(value)) { candidates.push(value["url"]); }
            } else {
                candidates.push(value);
            }
        }
    }
    const urlFromWorkspace = effectiveUrl !== "" && candidates.some(
        (candidate) => typeof candidate === "string" && candidate.trim() === effectiveUrl,
    );

    return { storageFromWorkspace, urlFromWorkspace };
}


export function shouldDowngradeServerStorage(origin: ServerStorageOrigin): boolean {
    return origin.storageFromWorkspace || origin.urlFromWorkspace;
}


export function readImageServerConfig(
    cfg: Pick<vscode.WorkspaceConfiguration, "get">,
): ImageServerResolution {
    return resolveImageServerConfig(cfg.get<unknown>("imageServer"), {
        url: cfg.get<string>("imageServerUrl", ""),
        fieldName: cfg.get<string>("imageServerFieldName", DEFAULT_IMAGE_SERVER_FIELD_NAME),
        extraParams: cfg.get<string>("imageServerExtraParams", ""),
        responsePath: cfg.get<string>("imageServerResponsePath", DEFAULT_IMAGE_SERVER_RESPONSE_PATH),
    });
}
