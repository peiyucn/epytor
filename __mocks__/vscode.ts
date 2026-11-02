/**
 * VSCode API 最小可用 mock，供 Vitest 单元测试使用。
 * 通过 vitest.config.ts 的 resolve.alias 将 "vscode" 重定向到此文件。
 */
import * as nodePath from "path";
import { vi } from "vitest";

function makeUri(fsPath: string, scheme = "file") {
    return {
        fsPath,
        scheme,
        path: fsPath,
        toString: () => (scheme === "file" ? `file://${fsPath}` : `${scheme}://${fsPath}`),
    };
}

export const Uri = {
    file: (p: string) => makeUri(p, "file"),
    joinPath: (base: { fsPath: string; scheme?: string }, ...parts: string[]) =>
        makeUri(nodePath.join(base.fsPath, ...parts), base.scheme ?? "file"),
    parse: (s: string) => {
        if (s.startsWith("file://")) return makeUri(decodeURIComponent(s.slice(7)), "file");
        return { fsPath: s, scheme: "unknown", path: s, toString: () => s };
    },
};

export const FileType = { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 } as const;

/** Minimal geometry types: navigation code constructs and compares these. */
export class Position {
    constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
    readonly start: Position;
    readonly end: Position;

    /** Supports both real overloads: (start, end) and (startLine, startChar, endLine, endChar). */
    constructor(
        start: Position | number,
        end: Position | number,
        endLine?: number,
        endCharacter?: number,
    ) {
        if (typeof start === "number") {
            this.start = new Position(start, typeof end === "number" ? end : 0);
            this.end = new Position(endLine ?? this.start.line, endCharacter ?? this.start.character);
        } else {
            this.start = start;
            this.end = end as Position;
        }
    }
}

export class Selection extends Range {
    constructor(public readonly anchor: Position, public readonly active: Position) {
        super(anchor, active);
    }
}

export const TextEditorRevealType = {
    Default: 0,
    InCenter: 1,
    InCenterIfOutsideViewport: 2,
    AtTop: 3,
} as const;

export const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 } as const;

/** Tab input types: extension commands discriminate on `instanceof`. */
export class TabInputCustom {
    constructor(
        public readonly uri: ReturnType<typeof makeUri>,
        public readonly viewType: string,
    ) {}
}

export class TabInputText {
    constructor(public readonly uri: ReturnType<typeof makeUri>) {}
}

export const workspace = {
    fs: {
        readFile: vi.fn<() => Promise<Uint8Array>>(),
        writeFile: vi.fn<() => Promise<void>>(),
        readDirectory: vi.fn<() => Promise<[string, number][]>>(),
        stat: vi.fn<() => Promise<{ type: number; size?: number }>>(),
        createDirectory: vi.fn<() => Promise<void>>(),
        delete: vi.fn<() => Promise<void>>(),
        rename: vi.fn<() => Promise<void>>(),
    },
    getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
    })),
    getWorkspaceFolder: vi.fn(() => undefined as undefined | { uri: ReturnType<typeof makeUri> }),
    workspaceFolders: undefined as undefined | Array<{ uri: ReturnType<typeof makeUri> }>,
    openTextDocument: vi.fn(async (uri: ReturnType<typeof makeUri>) => ({ uri, lineCount: 1 })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
};

export const window = {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showWarningMessage: vi.fn(),
    showTextDocument: vi.fn(async () => ({})),
    createStatusBarItem: vi.fn(() => ({
        show: vi.fn(),
        hide: vi.fn(),
        dispose: vi.fn(),
        text: "",
        tooltip: "",
        command: undefined as string | undefined,
    })),
    onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeTextEditorVisibleRanges: vi.fn(() => ({ dispose: vi.fn() })),
    registerCustomEditorProvider: vi.fn(() => ({ dispose: vi.fn() })),
    activeTextEditor: undefined as unknown,
    tabGroups: { all: [] as unknown[], activeTabGroup: undefined as unknown },
};

export const StatusBarAlignment = { Left: 1, Right: 2 } as const;

export const commands = {
    // Real VS Code returns a Thenable; callers chain `.then` for error logging.
    executeCommand: vi.fn(() => Promise.resolve(undefined)),
    registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
};

export const env = {
    language: "en",
    openExternal: vi.fn(() => Promise.resolve(true)),
};

/**
 * Real (small) EventEmitter. Units are exercised through `new` and then bound to their
 * events, so a bare `vi.fn()` stub (not constructable, no real fan-out) is not enough.
 */
export class EventEmitter<T = unknown> {
    private listeners = new Set<(event: T) => void>();

    readonly event = (listener: (event: T) => void): { dispose(): void } => {
        this.listeners.add(listener);
        return { dispose: () => { this.listeners.delete(listener); } };
    };

    readonly fire = (event: T): void => {
        for (const listener of [...this.listeners]) { listener(event); }
    };

    readonly dispose = (): void => {
        this.listeners.clear();
    };
}

export const l10n = {
    t: vi.fn((msg: string, ...args: unknown[]) =>
        args.reduce<string>((s, arg, i) => s.replace(`{${i}}`, String(arg)), msg)
    ),
};

/** Real class: host code calls `new CancellationTokenSource()` and disposes it. */
export class CancellationTokenSource {
    readonly token = {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(() => ({ dispose: vi.fn() })),
    };
    readonly cancel = vi.fn();
    readonly dispose = vi.fn();
}
