/**
 * HTML document for the WYSIWYG webview.
 *
 * Config values are sanitized before they are injected into the page: workspace settings travel
 * with a cloned repo and must not be able to escape the style/script context.
 */
import * as vscode from "vscode";
import { statSync } from "node:fs";
import { getNonce } from "../utils/getNonce";
import { ZH_CN_WEBVIEW } from "../i18n/webviewTranslations";
import {
    DEFAULT_CODE_BLOCK_MAX_HEIGHT,
    DEFAULT_EDITOR_MAX_WIDTH,
    MIN_CODE_BLOCK_MAX_HEIGHT,
    MIN_EDITOR_MAX_WIDTH,
    sanitizeCssNumber,
    sanitizeSerializationMode,
} from "../utils/webviewConfigSanitize";
import { buildWebviewHtml } from "../utils/webviewHtml";
import { normalizeTableWrapMode, resolveTableWrapVars } from "../../shared/tableWrap";

/** Append a cache-busting query. The unit-test webview mock returns a plain string. */
function appendCacheStamp(uri: string, stamp: string): string {
    return `${uri}${uri.includes("?") ? "&" : "?"}v=${stamp}`;
}

/**
 * Cache stamp for the webview bundle. A same-version reinstall keeps the same resource URL,
 * so use the bundle mtime to force the webview to fetch the new build after reinstall.
 */
function webviewBuildStamp(extensionUri: vscode.Uri): string {
    try {
        return Math.trunc(
            statSync(vscode.Uri.joinPath(extensionUri, "dist", "webview.js").fsPath).mtimeMs,
        ).toString(36);
    } catch {
        return Date.now().toString(36);
    }
}

export function buildEditorWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
    const cfg = vscode.workspace.getConfiguration("epytor");
    const maxHeight = sanitizeCssNumber(
        cfg.get("codeBlockMaxHeight", DEFAULT_CODE_BLOCK_MAX_HEIGHT),
        DEFAULT_CODE_BLOCK_MAX_HEIGHT,
        MIN_CODE_BLOCK_MAX_HEIGHT,
    );
    const editorMaxWidth = sanitizeCssNumber(
        cfg.get("editorMaxWidth", DEFAULT_EDITOR_MAX_WIDTH),
        DEFAULT_EDITOR_MAX_WIDTH,
        MIN_EDITOR_MAX_WIDTH,
    );
    // Normalize at the boundary: a config value can be any JSON scalar.
    const tableWrapVars = resolveTableWrapVars(normalizeTableWrapMode(cfg.get("tableWrapMode")));
    const buildStamp = webviewBuildStamp(extensionUri);
    const scriptUri = appendCacheStamp(
        webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.js")).toString(),
        buildStamp,
    );
    const styleUri = appendCacheStamp(
        webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview.css")).toString(),
        buildStamp,
    );
    const nonce = getNonce();

    const lang = vscode.env.language.toLowerCase();
    const isMac = process.platform === "darwin";
    const translations = lang.startsWith("zh") ? ZH_CN_WEBVIEW : {};
    const serializationMode = sanitizeSerializationMode(cfg.get("serializationMode", "clean"));
    const i18nScript = `window.__i18n=${JSON.stringify({ translations, isMac, serializationMode })};`;

    return buildWebviewHtml({
        language: vscode.env.language,
        cspSource: webview.cspSource,
        nonce,
        styleUri: styleUri.toString(),
        scriptUri: scriptUri.toString(),
        i18nScript,
        cssVars: {
            "--code-block-max-height": `${maxHeight}px`,
            "--editor-max-width": `${editorMaxWidth}px`,
            "--epytor-table-word-break": tableWrapVars.wordBreak,
            "--epytor-table-white-space": tableWrapVars.whiteSpace,
            "--epytor-table-overflow-x": tableWrapVars.overflowX,
            "--epytor-table-width": tableWrapVars.tableWidth,
        },
    });
}
