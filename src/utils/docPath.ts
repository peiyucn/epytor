
import * as path from "path";
import * as vscode from "vscode";

export interface DocPathContext {

    docFsPath: string;

    workspaceRoot: string | null;
}


export function resolveWorkspaceRoot(uri: vscode.Uri): string | undefined {
    return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}


export function resolveDocPath(raw: string, ctx: DocPathContext): string {
    const docDir = path.dirname(ctx.docFsPath);
    if (raw.startsWith("@/")) {
        return path.join(ctx.workspaceRoot ?? docDir, raw.slice(2));
    }
    return path.resolve(docDir, raw);
}
