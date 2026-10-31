/**
 * "Open this path link" handling for `Ctrl+click` in the editor.
 *
 * `.md` targets open in the WYSIWYG editor, other files in the text editor, and a numeric
 * `#<line>` fragment positions the target. Extracted from the provider so the workspace
 * containment guard sits next to the resolution it protects.
 */
import * as path from "path";
import * as vscode from "vscode";
import { resolveDocPath } from "../utils/docPath";
import { fireAndLog } from "../utils/fireAndLog";
import { isPathWithinBase } from "../utils/pathGuard";

export interface PathLinkHost {
    /** WYSIWYG custom-editor view type for markdown targets. */
    readonly viewType: string;
    /** Stash a pending scroll target for a markdown document. */
    setPendingNavigation(fsPath: string, line: number): void;
}

/** Open a path link; `pathLink` is the raw link target as written in the document. */
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

    // Path links must stay inside the workspace root.
    // Regression: absolute and ../ paths could open any local file from a malicious repo.
    const containingFolder = vscode.workspace.workspaceFolders?.find(
        f => documentFsPath.startsWith(f.uri.fsPath + path.sep),
    );
    const workspaceRootForDoc =
        containingFolder?.uri.fsPath ??
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
    // `@/` is the workspace root alias; without a workspace it falls back to the document
    // directory, the same rule image display and save use (see resolveDocPath).
    const absPath = resolveDocPath(
        filePath,
        { docFsPath: documentFsPath, workspaceRoot: workspaceRootForDoc },
    );

    // Validate after resolution; standalone files (no workspace root) are not restricted.
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
