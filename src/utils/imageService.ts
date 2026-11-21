import * as path from "path";
import * as os from "os";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";
import * as vscode from "vscode";
import { planImageLocalDir } from "./imageLocalDir";
import type { ImageServerSettings } from "./imageServerConfig";

const MAX_ALT_TEXT_LENGTH = 20;

const UPLOAD_TIMEOUT_MS = 30_000;

const MAX_UPLOAD_RESPONSE_BYTES = 1024 * 1024;

export function getByPath(obj: unknown, dotPath: string): unknown {
    return dotPath.split(".").reduce<unknown>((acc, key) => {
        if (acc != null && typeof acc === "object") {
            return (acc as Record<string, unknown>)[key];
        }
        return undefined;
    }, obj);
}

export function mimeToExt(mimeType: string): string {
    const map: Record<string, string> = {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/jpg": "jpg",
        "image/gif": "gif",
        "image/webp": "webp",
        "image/svg+xml": "svg",
        "image/bmp": "bmp",
        "image/tiff": "tiff",
    };
    return map[mimeType] ?? "png";
}

export function generateFilename(altText: string, mimeType: string): string {
    const sanitized =
        (altText || "image")
            .slice(0, MAX_ALT_TEXT_LENGTH)
            .replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "image";
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 6);
    const ext = mimeToExt(mimeType);
    return `${sanitized}_${ts}_${rand}.${ext}`;
}

async function dirExists(uri: vscode.Uri): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(uri);
        return stat.type === vscode.FileType.Directory;
    } catch {
        return false;
    }
}

export async function firstExistingDir(candidates: string[]): Promise<string | null> {
    for (const candidate of candidates) {
        if (await dirExists(vscode.Uri.file(candidate))) { return candidate; }
    }
    return null;
}

export function isWorkspaceLevelSetting(cfg: vscode.WorkspaceConfiguration, key: string): boolean {
    const inspect = cfg.inspect?.(key);
    return inspect?.workspaceValue !== undefined || inspect?.workspaceFolderValue !== undefined;
}

interface SaveImageResult {
    relPath: string;
    absUri: vscode.Uri;

    downgraded: boolean;
}

export async function saveImageLocally(
    docUri: vscode.Uri,
    cfg: vscode.WorkspaceConfiguration,
    data: Uint8Array,
    mimeType: string,
    altText: string,
): Promise<SaveImageResult> {
    const ext = mimeToExt(mimeType);
    let targetDir: vscode.Uri;

    const plan = planImageLocalDir({
        customPath: cfg.get<string>("imageLocalPath", "").trim(),
        docDir: docUri.scheme === "file" ? path.dirname(docUri.fsPath) : null,
        workspaceRoot: vscode.workspace.getWorkspaceFolder(docUri)?.uri.fsPath ?? null,
        workspaceLevel: isWorkspaceLevelSetting(cfg, "imageLocalPath"),
    });

    const localDirDowngraded = plan.kind === "fixed" && plan.downgraded;

    if (plan.kind === "fixed") {

        targetDir = vscode.Uri.file(plan.dir);
        await vscode.workspace.fs.createDirectory(targetDir);
    } else if (docUri.scheme !== "file") {

        targetDir = vscode.Uri.file(path.join(os.homedir(), "images"));
        await vscode.workspace.fs.createDirectory(targetDir);
    } else {

        const fallback = plan.fallbackDir ?? path.join(path.dirname(docUri.fsPath), "images");
        const found = await firstExistingDir(plan.candidates);
        targetDir = vscode.Uri.file(found ?? fallback);
        if (!found) {
            await vscode.workspace.fs.createDirectory(targetDir);
        }
    }

    const newHash = crypto.createHash("md5").update(data).digest("hex");
    let entries: [string, vscode.FileType][] = [];
    try {
        entries = await vscode.workspace.fs.readDirectory(targetDir);
    } catch {}
    for (const [name, type] of entries) {
        if (type !== vscode.FileType.File) {
            continue;
        }
        if (!name.endsWith("." + ext)) {
            continue;
        }
        const existingUri = vscode.Uri.joinPath(targetDir, name);
        let existingData: Uint8Array | null = null;
        try {
            existingData = await vscode.workspace.fs.readFile(existingUri);
        } catch {}
        if (!existingData) {
            continue;
        }
        const existingHash = crypto
            .createHash("md5")
            .update(existingData)
            .digest("hex");
        if (existingHash === newHash) {
            const relPath = buildRelPath(docUri, existingUri);
            return { relPath, absUri: existingUri, downgraded: localDirDowngraded };
        }
    }

    const filename = generateFilename(altText, mimeType);
    const fileUri = vscode.Uri.joinPath(targetDir, filename);
    await vscode.workspace.fs.writeFile(fileUri, data);

    const relPath = buildRelPath(docUri, fileUri);
    return { relPath, absUri: fileUri, downgraded: localDirDowngraded };
}

export function buildRelPath(docUri: vscode.Uri, fileUri: vscode.Uri): string {
    if (docUri.scheme !== "file") {
        return fileUri.fsPath;
    }
    const mdDir = path.dirname(docUri.fsPath);
    let rel = path.relative(mdDir, fileUri.fsPath).replace(/\\/g, "/");
    if (!rel.startsWith(".")) {
        rel = "./" + rel;
    }
    return rel;
}

export async function uploadImageToServer(
    settings: ImageServerSettings,
    data: Uint8Array,
    mimeType: string,
    altText: string,
): Promise<string> {
    const serverUrl = settings.url;
    if (!serverUrl) {
        throw new Error(vscode.l10n.t("Please set epytor.imageServer.url in Settings first"));
    }

    const fieldName = settings.fieldName;
    const responsePath = settings.responsePath;
    const extraParams = settings.extraParams;

    const boundary = `----FormBoundary${Date.now().toString(16)}`;
    const filename = generateFilename(altText, mimeType);
    const CRLF = "\r\n";

    const parts: Buffer[] = [];

    for (const [key, value] of Object.entries(extraParams)) {
        parts.push(
            Buffer.from(
                `--${boundary}${CRLF}` +
                    `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}` +
                    `${value}${CRLF}`,
            ),
        );
    }

    parts.push(
        Buffer.from(
            `--${boundary}${CRLF}` +
                `Content-Disposition: form-data; name="${fieldName}"; filename="${filename}"${CRLF}` +
                `Content-Type: ${mimeType}${CRLF}${CRLF}`,
        ),
    );
    parts.push(Buffer.from(data));
    parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

    const body = Buffer.concat(parts);

    const url = new URL(serverUrl);
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    const responseBody = await new Promise<string>((resolve, reject) => {
        const options: http.RequestOptions = {
            method: "POST",
            hostname: url.hostname,
            port: url.port || (isHttps ? 443 : 80),
            path: url.pathname + url.search,
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "Content-Length": body.length,
            },
        };

        const req = transport.request(options, (res) => {
            const chunks: Buffer[] = [];
            let totalBytes = 0;
            res.on("data", (chunk: Buffer) => {
                totalBytes += chunk.length;
                if (totalBytes > MAX_UPLOAD_RESPONSE_BYTES) {

                    req.destroy();
                    reject(new Error(vscode.l10n.t("Upload response exceeds {0} bytes", MAX_UPLOAD_RESPONSE_BYTES)));
                    return;
                }
                chunks.push(chunk);
            });
            res.on("end", () =>
                resolve(Buffer.concat(chunks).toString("utf-8")),
            );
        });

        req.on("error", reject);

        req.setTimeout(UPLOAD_TIMEOUT_MS, () => {
            req.destroy(new Error(vscode.l10n.t("Image upload timed out after {0}s", UPLOAD_TIMEOUT_MS / 1000)));
        });

        req.write(body);
        req.end();
    });

    let parsed: unknown;
    try {
        parsed = JSON.parse(responseBody);
    } catch {

        throw new Error(vscode.l10n.t("Server returned a non-JSON response"));
    }

    const imageUrl = getByPath(parsed, responsePath);
    if (typeof imageUrl !== "string" || !imageUrl) {
        throw new Error(
            vscode.l10n.t("Cannot extract the image URL using path \"{0}\" from the response", responsePath),
        );
    }

    return imageUrl;
}
