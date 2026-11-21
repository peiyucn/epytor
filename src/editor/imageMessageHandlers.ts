
import * as path from "path";
import * as vscode from "vscode";
import { firstExistingDir, isWorkspaceLevelSetting, saveImageLocally, uploadImageToServer } from "../utils/imageService";
import { planImageLocalDir } from "../utils/imageLocalDir";
import {
    describeImageServerIssue,
    readImageServerConfig,
    readServerStorageOrigin,
    shouldDowngradeServerStorage,
    type ImageServerIssue,
} from "../utils/imageServerConfig";
import { normalizeImageDestination } from "../utils/contentTransform";
import { resolveDocPath, resolveWorkspaceRoot } from "../utils/docPath";
import { sanitizeBasename } from "../utils/safeBasename";
import type { PathSuggestionItem, ProjectImage } from "../../shared/messages";

const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;

const PATH_SUGGESTION_LIMIT = 15;

const PATH_SUGGESTION_IGNORED_NAMES = new Set(["node_modules", ".git", "dist", ".DS_Store", "out", ".vscode-test"]);

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".ico"]);

export interface ImageHandlerContext {
    readonly documentUri: vscode.Uri;
    readonly panel: vscode.WebviewPanel;
    readonly uriKey: string;

    registerImageMapping(webviewUri: string, displayPath: string): void;

    getImageMapping(webviewUri: string): string | undefined;

    deleteImageMapping(webviewUri: string): void;
}

const insecureServerUrlWarned = new Set<string>();

function warnInsecureServerUrlOnce(serverUrl: string): void {
    let isPlainHttp: boolean;
    try {
        isPlainHttp = new URL(serverUrl).protocol === "http:";
    } catch {
        return;
    }
    if (!isPlainHttp || insecureServerUrlWarned.has(serverUrl)) { return; }
    insecureServerUrlWarned.add(serverUrl);
    void vscode.window.showWarningMessage(
        vscode.l10n.t("The image server URL uses plain http; uploads are sent unencrypted"),
    );
}

function warnImageServerIssues(issues: ImageServerIssue[]): void {
    for (const issue of issues) {
        const { message, args } = describeImageServerIssue(issue);
        void vscode.window.showWarningMessage(vscode.l10n.t(message, ...args));
    }
}

export async function handleImageUpload(
    ctx: ImageHandlerContext,
    id: string,
    data: Uint8Array,
    mimeType: string,
    altText: string,
): Promise<void> {
    if (data.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
        ctx.panel.webview.postMessage({
            type: "imageUploadError",
            id,
            error: vscode.l10n.t(
                "Image too large: maximum size is {0} MB",
                Math.round(MAX_IMAGE_UPLOAD_BYTES / 1024 / 1024),
            ),
        });
        return;
    }
    const cfg = vscode.workspace.getConfiguration("epytor", ctx.documentUri);
    const storage = cfg.get<string>("imageStorage", "local");
    try {

        const resolution = storage === "server" ? readImageServerConfig(cfg) : undefined;
        if (resolution) { warnImageServerIssues(resolution.issues); }

        const downgraded = resolution !== undefined
            && shouldDowngradeServerStorage(readServerStorageOrigin(cfg, resolution.settings.url));
        if (downgraded) {
            ctx.panel.webview.postMessage({
                type: "notice",
                message: vscode.l10n.t("Uploading to the image server was skipped because the image server settings come from workspace settings; the image was saved locally instead"),
            });
        } else if (resolution) {

            warnInsecureServerUrlOnce(resolution.settings.url);
        }

        let url: string;
        if (resolution && !downgraded) {
            url = await uploadImageToServer(resolution.settings, data, mimeType, altText);
        } else {
            const { relPath, absUri, downgraded: localDirDowngraded } = await saveImageLocally(
                ctx.documentUri, cfg, data, mimeType, altText,
            );
            const webviewUri = ctx.panel.webview.asWebviewUri(absUri);
            url = webviewUri.toString();
            ctx.registerImageMapping(url, relPath);

            if (localDirDowngraded) {
                ctx.panel.webview.postMessage({
                    type: "notice",
                    message: vscode.l10n.t("The workspace setting for the image folder is outside the workspace, so the image was saved next to the document instead"),
                });
            }
        }
        ctx.panel.webview.postMessage({ type: "imageUploaded", id, url });
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        ctx.panel.webview.postMessage({ type: "imageUploadError", id, error: errMsg });
        vscode.window.showErrorMessage(vscode.l10n.t("Image upload failed: {0}", errMsg));
    }
}

export async function handleGetProjectImages(ctx: ImageHandlerContext, id: string): Promise<void> {
    const cfg = vscode.workspace.getConfiguration("epytor", ctx.documentUri);

    const plan = planImageLocalDir({
        customPath: cfg.get<string>("imageLocalPath", "").trim(),
        docDir: ctx.documentUri.scheme === "file" ? path.dirname(ctx.documentUri.fsPath) : null,
        workspaceRoot: vscode.workspace.getWorkspaceFolder(ctx.documentUri)?.uri.fsPath ?? null,
        workspaceLevel: isWorkspaceLevelSetting(cfg, "imageLocalPath"),
    });

    let targetDir: vscode.Uri | null;
    if (plan.kind === "fixed") {
        targetDir = vscode.Uri.file(plan.dir);
    } else {
        const found = await firstExistingDir(plan.candidates);
        const dir = found ?? plan.fallbackDir;
        targetDir = dir ? vscode.Uri.file(dir) : null;
    }

    const images: ProjectImage[] = [];

    if (targetDir) {
        const mdDir = ctx.documentUri.scheme === "file" ? path.dirname(ctx.documentUri.fsPath) : "";
        try {
            const entries = await vscode.workspace.fs.readDirectory(targetDir);
            for (const [name, type] of entries) {
                if (type !== vscode.FileType.File) { continue; }
                const ext = path.extname(name).toLowerCase();
                if (!IMAGE_EXTS.has(ext)) { continue; }
                const fileUri = vscode.Uri.joinPath(targetDir, name);
                const wvUri = ctx.panel.webview.asWebviewUri(fileUri).toString();
                let relPath = name;
                if (mdDir) {
                    const rel = path.relative(mdDir, fileUri.fsPath).replace(/\\/g, "/");
                    relPath = rel.startsWith(".") ? rel : "./" + rel;
                }
                ctx.registerImageMapping(wvUri, relPath);
                images.push({ relPath, webviewUri: wvUri, name });
            }
        } catch (error) {

            ctx.panel.webview.postMessage({
                type: "notice",
                message: vscode.l10n.t(
                    "Cannot read image folder: {0}",
                    error instanceof Error ? error.message : String(error),
                ),
            });
        }
    }

    ctx.panel.webview.postMessage({ type: "projectImagesList", id, images });
}

export async function handleImageRename(
    ctx: ImageHandlerContext,
    id: string,
    webviewUri: string,
    newBasename: string,
): Promise<void> {
    const oldRelPath = ctx.getImageMapping(webviewUri);
    if (!oldRelPath) {
        ctx.panel.webview.postMessage({ type: "imageRenameError", id, error: "Image not found in URI map" });
        return;
    }

    try {
        const mdDir = path.dirname(ctx.documentUri.fsPath);

        const oldAbsPath = resolveDocPath(normalizeImageDestination(oldRelPath), {
            docFsPath: ctx.documentUri.fsPath,
            workspaceRoot: resolveWorkspaceRoot(ctx.documentUri) ?? null,
        });
        const oldUri = vscode.Uri.file(oldAbsPath);

        await vscode.workspace.fs.stat(oldUri);

        const oldExt = path.extname(oldAbsPath);
        const safeBasename = sanitizeBasename(newBasename);
        if (!safeBasename) {
            ctx.panel.webview.postMessage({ type: "imageRenameError", id, error: "Invalid filename" });
            return;
        }

        const dir = path.dirname(oldAbsPath);
        const targetUri = vscode.Uri.file(path.join(dir, safeBasename + oldExt));

        try {
            await vscode.workspace.fs.stat(targetUri);
            const errMsg = vscode.l10n.t('A file named "{0}" already exists.', safeBasename + oldExt);
            ctx.panel.webview.postMessage({ type: "imageRenameError", id, error: errMsg });
            vscode.window.showErrorMessage(errMsg);
            return;
        } catch {}

        await vscode.workspace.fs.rename(oldUri, targetUri);

        const rel = path.relative(mdDir, targetUri.fsPath).replace(/\\/g, "/");
        const newRelPath = rel.startsWith(".") ? rel : "./" + rel;
        const newWebviewUri = ctx.panel.webview.asWebviewUri(targetUri).toString();

        ctx.deleteImageMapping(webviewUri);
        ctx.registerImageMapping(newWebviewUri, newRelPath);

        ctx.panel.webview.postMessage({
            type: "imageRenamed",
            id,
            oldWebviewUri: webviewUri,
            newWebviewUri,
            newRelPath,
        });
    } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        ctx.panel.webview.postMessage({ type: "imageRenameError", id, error: errMsg });
        vscode.window.showErrorMessage(vscode.l10n.t("Image rename failed: {0}", errMsg));
    }
}

export async function handleGetPathSuggestions(
    ctx: ImageHandlerContext,
    id: string,
    query: string,
): Promise<void> {
    const q = query.trim();
    if (!q) {
        ctx.panel.webview.postMessage({ type: "pathSuggestions", id, items: [] });
        return;
    }

    const docFsPath = ctx.documentUri.fsPath;

    const workspaceRoot = resolveWorkspaceRoot(ctx.documentUri);

    const lastSlash = q.lastIndexOf("/");
    const dirPart = lastSlash >= 0 ? q.slice(0, lastSlash + 1) : "";
    const namePart = lastSlash >= 0 ? q.slice(lastSlash + 1) : q;

    const absDir = resolveDocPath(dirPart, {
        docFsPath,
        workspaceRoot: workspaceRoot ?? null,
    });

    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(absDir));
    } catch {
        ctx.panel.webview.postMessage({ type: "pathSuggestions", id, items: [] });
        return;
    }

    const items: PathSuggestionItem[] = entries
        .filter(([name, type]) =>
            !PATH_SUGGESTION_IGNORED_NAMES.has(name) &&
            name.toLowerCase().startsWith(namePart.toLowerCase()) &&
            (type === vscode.FileType.File || type === vscode.FileType.Directory) &&
            !(type === vscode.FileType.File && name.toLowerCase() === namePart.toLowerCase()),
        )
        .sort(([an, at], [bn, bt]) => {
            if (at !== bt) { return bt === vscode.FileType.Directory ? 1 : -1; }
            return an.localeCompare(bn);
        })
        .slice(0, PATH_SUGGESTION_LIMIT)
        .map(([name, type]) => {
            const fullPath = dirPart + name + (type === vscode.FileType.Directory ? "/" : "");
            let webviewUri: string | undefined;
            if (type === vscode.FileType.File) {
                const ext = path.extname(name).toLowerCase();
                if (IMAGE_EXTS.has(ext)) {
                    const absFilePath = path.join(absDir, name);
                    webviewUri = ctx.panel.webview.asWebviewUri(vscode.Uri.file(absFilePath)).toString();
                    ctx.registerImageMapping(webviewUri, fullPath);
                }
            }
            return { path: fullPath, isDir: type === vscode.FileType.Directory, webviewUri };
        });

    ctx.panel.webview.postMessage({ type: "pathSuggestions", id, items });
}

export async function handleResolveImagePath(
    ctx: ImageHandlerContext,
    id: string,
    relPath: string,
): Promise<void> {
    if (ctx.documentUri.scheme !== "file") { return; }
    try {
        const absPath = resolveDocPath(relPath, {
            docFsPath: ctx.documentUri.fsPath,
            workspaceRoot: resolveWorkspaceRoot(ctx.documentUri) ?? null,
        });

        const exists = await vscode.workspace.fs.stat(vscode.Uri.file(absPath))
            .then(() => true, () => false);
        if (!exists) { return; }
        const webviewUri = ctx.panel.webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
        ctx.registerImageMapping(webviewUri, relPath);
        ctx.panel.webview.postMessage({ type: "imagePathResolved", id, webviewUri });
    } catch (error) {

        console.warn(`[epytor] image path resolution failed for ${ctx.uriKey}:`, error);
    }
}
