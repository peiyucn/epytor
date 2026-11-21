
import * as path from "path";
import * as vscode from "vscode";
import { resolveDocPath } from "../utils/docPath";
import { fireAndLog } from "../utils/fireAndLog";
import { isPathWithinBase } from "../utils/pathGuard";

export interface PathLinkHost {

    readonly viewType: string;

    setPendingNavigation(fsPath: string, line: number): void;
}

export async function openPathLink(
    documentFsPath: string,
    pathLink: string,
    host: PathLinkHost,
): Promise<void> {
    const hashIdx = pathLink.indexOf("#");
    const filePath = hashIdx >= 0 ? pathLink.slice(0, hashIdx) : pathLink;
    const fragment = hashIdx >= 0 ? pathLink.slice(hashIdx + 1) : undefined;
    const lineMatch = fragment?.match(/^(\d+)(-\d+)?$/);
    const lineNumber = lineMatch ? parseInt(lineMatch[1], 10) : undefined;

    const containingFolder = vscode.workspace.workspaceFolders?.find(
        f => documentFsPath.startsWith(f.uri.fsPath + path.sep),
    );

    const workspaceRootForDoc = containingFolder?.uri.fsPath ?? null;

    const absPath = resolveDocPath(
        filePath,
        { docFsPath: documentFsPath, workspaceRoot: workspaceRootForDoc },
    );

    if (containingFolder && !isPathWithinBase(absPath, containingFolder.uri.fsPath)) {
        return;
    }

    const targetUri = vscode.Uri.file(absPath);
    if (/\.(md|markdown)$/i.test(absPath)) {
        if (lineNumber !== undefined) {
            host.setPendingNavigation(absPath, lineNumber);
        }
        await vscode.commands.executeCommand(
            "vscode.openWith",
            targetUri,
            host.viewType,
            { preview: true },
        );
    } else if (lineNumber !== undefined) {
        const doc = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(doc, {
            selection: new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 0),
            preview: true,
        });
    } else {
        fireAndLog(vscode.commands.executeCommand("vscode.open", targetUri), "vscode.open");
    }
}
