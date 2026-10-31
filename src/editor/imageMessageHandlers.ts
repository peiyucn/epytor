/**
 * Image message handlers: upload, gallery listing, rename, path suggestions and image-path
 * resolution.
 *
 * These used to live as five private methods on the provider, where every one of them reached
 * back into the provider's panel/uri bookkeeping. The explicit `ImageHandlerContext` keeps the
 * coupling visible and lets the handlers be exercised with a fake panel and map.
 */
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

/** Regression: an unbounded payload could spike memory through one huge postMessage. */
const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024;
/** Cap on path-completion results; the dropdown is not a file browser. */
const PATH_SUGGESTION_LIMIT = 15;
/** Directories that only add noise to path completion. */
const PATH_SUGGESTION_IGNORED_NAMES = new Set(["node_modules", ".git", "dist", ".DS_Store", "out", ".vscode-test"]);
/** Extensions treated as images by the gallery and the thumbnail preview. */
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tiff", ".ico"]);

/**
 * Everything a handler needs from the provider. Image URI mapping (webviewUri -> the exact path
 * spelling to write back into the document) stays owned by the provider; handlers only register,
 * look up and drop entries through these callbacks.
 */
export interface ImageHandlerContext {
    readonly documentUri: vscode.Uri;
    readonly panel: vscode.WebviewPanel;
    readonly uriKey: string;
    /** Record webviewUri -> the path string that belongs in the document. */
    registerImageMapping(webviewUri: string, displayPath: string): void;
    /** Document spelling previously registered for a webview URI (image rename lookup). */
    getImageMapping(webviewUri: string): string | undefined;
    /** Drop one mapping (image rename replaces the old webview URI). */
    deleteImageMapping(webviewUri: string): void;
}

/** Warned once per URL: a server configured with plain http is allowed but flagged. */
const insecureServerUrlWarned = new Set<string>();

function warnInsecureServerUrlOnce(serverUrl: string): void {
    let isPlainHttp = false;
    try {
        isPlainHttp = new URL(serverUrl).protocol === "http:";
    } catch {
        return; // Unparseable URL: the upload itself will surface a concrete error.
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
        // New `imageServer` key wins over the 4 deprecated ones; invalid config must warn visibly,
        // never be silently ignored.
        const resolution = storage === "server" ? readImageServerConfig(cfg) : undefined;
        if (resolution) { warnImageServerIssues(resolution.issues); }

        // Workspace-level settings must not choose the upload target: a cloned repo could ship
        // .vscode/settings.json pointing at an attacker and exfiltrate pasted images.
        const downgraded = resolution !== undefined
            && shouldDowngradeServerStorage(readServerStorageOrigin(cfg, resolution.settings.url));
        if (downgraded) {
            ctx.panel.webview.postMessage({
                type: "notice",
                message: vscode.l10n.t("Uploading to the image server was skipped because the image server settings come from workspace settings; the image was saved locally instead"),
            });
        } else if (resolution) {
            // Plain http is allowed (intranet use) but warned once per URL.
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
            // Workspace-level settings may not pick the folder; say so instead of silently
            // writing somewhere other than the configured path.
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

    // Share planImageLocalDir with the write path: without it, a workspace-level imageLocalPath
    // let the gallery list names and thumbnails outside the workspace (e.g. ~/.ssh).
    const plan = planImageLocalDir({
        customPath: cfg.get<string>("imageLocalPath", "").trim(),
        docDir: ctx.documentUri.scheme === "file" ? path.dirname(ctx.documentUri.fsPath) : null,
        workspaceRoot: vscode.workspace.getWorkspaceFolder(ctx.documentUri)?.uri.fsPath ?? null,
        workspaceLevel: isWorkspaceLevelSetting(cfg, "imageLocalPath"),
    });

    let targetDir: vscode.Uri | null = null;
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
            // "No images" and "cannot read the folder" used to look identical in the gallery.
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
        // The uriMap keeps the document's original spelling, so `@/assets/a.png` must be
        // resolved with the same rules as display/save; `path.resolve(mdDir, …)` used to report
        // "Image not found" for workspace-relative spellings.
        const oldAbsPath = resolveDocPath(normalizeImageDestination(oldRelPath), {
            docFsPath: ctx.documentUri.fsPath,
            workspaceRoot: resolveWorkspaceRoot(ctx.documentUri) ?? null,
        });
        const oldUri = vscode.Uri.file(oldAbsPath);

        await vscode.workspace.fs.stat(oldUri);

        // Reject illegal characters and Windows reserved device names.
        const oldExt = path.extname(oldAbsPath);
        const safeBasename = sanitizeBasename(newBasename);
        if (!safeBasename) {
            ctx.panel.webview.postMessage({ type: "imageRenameError", id, error: "Invalid filename" });
            return;
        }

        const dir = path.dirname(oldAbsPath);
        const targetUri = vscode.Uri.file(path.join(dir, safeBasename + oldExt));

        // Never overwrite: an existing target is reported, not replaced.
        try {
            await vscode.workspace.fs.stat(targetUri);
            const errMsg = vscode.l10n.t('A file named "{0}" already exists.', safeBasename + oldExt);
            ctx.panel.webview.postMessage({ type: "imageRenameError", id, error: errMsg });
            vscode.window.showErrorMessage(errMsg);
            return;
        } catch { /* not found: continue */ }

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
    // Owning folder only: a standalone file falls back to its own directory for `@/`.
    const workspaceRoot = resolveWorkspaceRoot(ctx.documentUri);

    const lastSlash = q.lastIndexOf("/");
    const dirPart = lastSlash >= 0 ? q.slice(0, lastSlash + 1) : "";
    const namePart = lastSlash >= 0 ? q.slice(lastSlash + 1) : q;

    // `@/` is the workspace root alias; without a workspace it falls back to the document
    // directory like every other consumer. The old branch dropped the remainder of `@/a/b`,
    // which made the dropdown list the document directory regardless of the typed subpath.
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
        // No webviewUri -> the webview falls back to the raw relPath after its timeout.
        // `fs.existsSync` blocked the extension host on slow/network drives; the async stat has
        // the same existence semantics and can be mocked in tests.
        const exists = await vscode.workspace.fs.stat(vscode.Uri.file(absPath))
            .then(() => true, () => false);
        if (!exists) { return; }
        const webviewUri = ctx.panel.webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
        ctx.registerImageMapping(webviewUri, relPath);
        ctx.panel.webview.postMessage({ type: "imagePathResolved", id, webviewUri });
    } catch (error) {
        // Invalid path: no reply, the webview falls back after its timeout — but leave a trace.
        console.warn(`[epytor] image path resolution failed for ${ctx.uriKey}:`, error);
    }
}
