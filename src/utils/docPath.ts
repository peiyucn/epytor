/**
 * Resolution of document-relative paths.
 *
 * Images, `@/` links and path suggestions all used to carry their own copy of this logic. They
 * also disagreed on which directory `@/` falls back to when no workspace is open (one copy went
 * to the parent of the document directory); the fallback is now unified on the document
 * directory, so every caller resolves `@/x` the same way.
 */
import * as path from "path";
import * as vscode from "vscode";

export interface DocPathContext {
    /** Absolute path of the document the path is written in. */
    docFsPath: string;
    /** Absolute workspace root, or null for standalone files. */
    workspaceRoot: string | null;
}

/**
 * Workspace root for a document: its owning folder, or undefined for a standalone file.
 *
 * Regression: falling back to the first open folder made a file opened from outside the
 * workspace resolve `@/` against that folder instead of its own directory (E2E 2026-10-31),
 * which broke `@/images/...` in documents opened with a workspace already active.
 * A single implementation prevents the former copies from drifting on multi-root layouts.
 */
export function resolveWorkspaceRoot(uri: vscode.Uri): string | undefined {
    return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

/**
 * Resolve a path as written in a document.
 *
 * `@/` means the workspace root; everything else (including `./`, `../` and bare names) is
 * relative to the document's own directory. Without a workspace, `@/` falls back to the
 * document directory.
 */
export function resolveDocPath(raw: string, ctx: DocPathContext): string {
    const docDir = path.dirname(ctx.docFsPath);
    if (raw.startsWith("@/")) {
        return path.join(ctx.workspaceRoot ?? docDir, raw.slice(2));
    }
    return path.resolve(docDir, raw);
}
