import * as vscode from "vscode";
import { MarkdownDocument } from "./MarkdownDocument";
import { computeDisplayLineRanges, type LineRange } from "./utils/lineMap";
import { extractFrontmatter, restoreContentForSave, convertTableBrForDisplay, buildContentWithFrontmatter, normalizeImageDestination, rewriteImageSources } from "./utils/contentTransform";
import { ContentRequestCoordinator } from "./utils/contentRequestCoordinator";
import { shouldSkipSave } from "./utils/externalChangeDecision";
import { fireAndLog } from "./utils/fireAndLog";
import { resolveDocPath, resolveWorkspaceRoot } from "./utils/docPath";
import {
    handleGetPathSuggestions,
    handleGetProjectImages,
    handleImageRename,
    handleImageUpload,
    handleResolveImagePath,
    type ImageHandlerContext,
} from "./editor/imageMessageHandlers";
import { NavigationState, revealLineAtTop } from "./editor/navigation";
import { StatusBarPresenter } from "./editor/statusBar";
import { WriteAudit } from "./editor/writeAudit";
import { ExternalChangeCoordinator, type ExternalChangeHost } from "./editor/externalChange";
import { watchExternalWrites } from "./editor/fileWatcher";
import { openPathLink } from "./editor/pathLinks";
import { buildEditorWebviewHtml } from "./editor/webviewHtmlBuilder";
import { OPEN_URL_SCHEMES, extractUrlScheme } from "../shared/constants";
import { sanitizeSerializationMode } from "./utils/webviewConfigSanitize";
import type { ToExtensionMessage, ToWebviewMessage } from "../shared/messages";

const CONTENT_REQUEST_TIMEOUT_MS = 3000;

function isMarkdownDocument(document: vscode.TextDocument): boolean {
    const name = document.uri.path.toLowerCase();
    return name.endsWith(".md") || name.endsWith(".markdown");
}

function logHandlerFailure(handler: string): (error: unknown) => void {
    return (error) => console.error(`[epytor] ${handler} failed:`, error);
}

export class MarkdownEditorProvider
    implements vscode.CustomEditorProvider<MarkdownDocument> {
    public static readonly viewType = "epytor.editor";

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<
        vscode.CustomDocumentEditEvent<MarkdownDocument>
    >();
    public readonly onDidChangeCustomDocument =
        this._onDidChangeCustomDocument.event;

    private readonly _contentRequests: ContentRequestCoordinator;

    private readonly _webviewPanels = new Map<string, vscode.WebviewPanel>();

    private readonly _lastSaveTimes = new Map<string, number>();

    private readonly _webviewDirty = new Map<string, boolean>();

    private readonly _pushedContent = new Map<string, string>();

    private readonly _lastSavedContent = new Map<string, string>();

    private readonly _panelActive = new Map<string, boolean>();

    private readonly _imageUriMaps = new Map<string, Map<string, string>>();
    private readonly _frontmatterMap = new Map<string, string>();

    private readonly _navigation = new NavigationState();

    private readonly _initializedPanels = new Set<string>();

    public static current: MarkdownEditorProvider | null = null;

    public setGlobalRevealLine(line: number): void {
        this._navigation.setGlobalRevealLine(line);
    }

    public setPendingNavigation(fsPath: string, line: number, opts?: { directOnly?: boolean }): void {
        const uriKey = vscode.Uri.file(fsPath).toString();
        const initialized = this._initializedPanels.has(uriKey);
        const panel = this._webviewPanels.get(uriKey);
        const delivered = initialized && panel !== undefined && panel.visible;
        if (delivered) {
            panel.webview.postMessage({ type: 'scrollToLine', line });
        }
        if (!opts?.directOnly || !delivered) {
            this._navigation.rememberPendingNavigation(uriKey, line);
        }
    }

    public postToPanel(uri: vscode.Uri, msg: ToWebviewMessage): void {
        const panel = this._webviewPanels.get(uri.toString());
        if (panel) { panel.webview.postMessage(msg); }
    }

    public hasPanel(uri: vscode.Uri): boolean {
        return this._webviewPanels.has(uri.toString());
    }

    private _consumePendingNavigation(fsPath: string): number | undefined {
        return this._navigation.consumePendingNavigation(vscode.Uri.file(fsPath).toString());
    }

    public postToAll(msg: ToWebviewMessage): void {
        for (const panel of this._webviewPanels.values()) {
            panel.webview.postMessage(msg);
        }
    }

    public static register(
        context: vscode.ExtensionContext,
    ): vscode.Disposable {
        const provider = new MarkdownEditorProvider(context);
        MarkdownEditorProvider.current = provider;
        const disposable = vscode.window.registerCustomEditorProvider(
            MarkdownEditorProvider.viewType,
            provider,
            {
                webviewOptions: {

                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            },
        );

        return disposable;
    }

    private readonly _statusBar: StatusBarPresenter;

    private readonly _writeAudit: WriteAudit;

    private readonly _externalChange: ExternalChangeCoordinator;

    constructor(
        private readonly context: vscode.ExtensionContext,
    ) {
        this._statusBar = new StatusBarPresenter(() => this._activePanelUriKey());
        this._writeAudit = new WriteAudit(() => this.context.logUri.fsPath);
        this._externalChange = new ExternalChangeCoordinator(this._externalChangeHost());
        this._contentRequests = new ContentRequestCoordinator(
            (uriKey) => {
                this._webviewPanels.get(uriKey)?.webview.postMessage({ type: "requestContent" });
            },
            CONTENT_REQUEST_TIMEOUT_MS,
            (uriKey) => this._warnContentFallback(uriKey),
        );

        this.context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (!editor) { return; }
                const uriKey = editor.document.uri.toString();

                const pendingLine = this._navigation.takeEditorReveal(uriKey);
                if (pendingLine !== undefined) {
                    revealLineAtTop(editor, pendingLine);
                    return;
                }

                const previewLine = this._navigation.getPreviewLine(uriKey);
                if (previewLine !== undefined) { revealLineAtTop(editor, previewLine); }
            }),
        );
        this.context.subscriptions.push(
            vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
                const document = event.textEditor.document;
                if (!isMarkdownDocument(document)) { return; }
                const range = event.textEditor.visibleRanges[0];
                if (!range) { return; }
                this._navigation.recordTextLine(document.uri.toString(), range.start.line + 1);
            }),
        );
    }

    private _externalChangeHost(): ExternalChangeHost {
        return {
            getPanel: (uriKey) => this._webviewPanels.get(uriKey),
            isPanelActive: (uriKey) => this._panelActive.get(uriKey) === true,
            getLastSaveTime: (uriKey) => this._lastSaveTimes.get(uriKey),
            getLastSavedContent: (uriKey) => this._lastSavedContent.get(uriKey),
            isWebviewDirty: (uriKey) => this._webviewDirty.get(uriKey) === true,
            setWebviewDirty: (uriKey, dirty) => { this._webviewDirty.set(uriKey, dirty); },
            clearPushedContent: (uriKey) => { this._pushedContent.delete(uriKey); },
            seedLastSavedContent: (uriKey, content) => { this._lastSavedContent.set(uriKey, content); },
            requestContentDetailed: (document, uriKey) => this._requestContentDetailed(document, uriKey),
            prepareContentForDisplay: (document, panel, uriKey, content) =>
                this._prepareContentForDisplay(content, document, panel, uriKey),
            buildDisplayPayload: (uriKey, content, ranges) =>
                this._lifecyclePayload(uriKey, content, ranges),
            refreshFileSize: (document, uriKey) => this._refreshFileSize(document, uriKey),
            markDirty: (document) => this._markDirty(document),
        };
    }

    private _activePanelUriKey(): string | undefined {
        for (const [key, panel] of this._webviewPanels) {
            try {
                if (panel.active) { return key; }
            } catch {}
        }
        return undefined;
    }

    private readonly _fallbackWarnedUris = new Set<string>();

    private _warnContentFallback(uriKey: string): void {
        if (this._fallbackWarnedUris.has(uriKey)) return;
        this._fallbackWarnedUris.add(uriKey);
        void vscode.window.showWarningMessage(
            vscode.l10n.t("The editor is not responding; the file was saved with possibly outdated content"),
        );
    }

    async openCustomDocument(
        uri: vscode.Uri,
        _openContext: vscode.CustomDocumentOpenContext,
        _token: vscode.CancellationToken,
    ): Promise<MarkdownDocument> {
        return MarkdownDocument.create(uri);
    }

    async resolveCustomEditor(
        document: MarkdownDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {

        if (document.uri.scheme !== 'file') {
            webviewPanel.webview.html = '<!DOCTYPE html><html><body></body></html>';
            return;
        }

        const uriKey = document.uri.toString();
        this._webviewPanels.set(uriKey, webviewPanel);

        this._panelActive.set(uriKey, webviewPanel.active);
        this._lastSavedContent.set(uriKey, document.getText());

        this._auditWrite(uriKey, "open", document.getText());

        this._registerPanelDisposeCleanup(uriKey, webviewPanel);

        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.context.extensionUri, "dist"),
                ...(vscode.workspace.workspaceFolders?.map(f => f.uri) ?? []),
                vscode.Uri.joinPath(document.uri, '..'),
            ],
        };
        webviewPanel.webview.html = this._getHtmlForWebview(
            webviewPanel.webview,
        );

        this._registerViewStateHandler(document, webviewPanel, uriKey);

        webviewPanel.webview.onDidReceiveMessage(
            async (message: ToExtensionMessage) => {

                try {
                    await this._handleWebviewMessage(document, webviewPanel, uriKey, message);
                } catch (error) {
                    console.error("[epytor] webview message handler failed:", message?.type, error);
                }
            },
        );

        this._registerFileWatcher(document, webviewPanel, uriKey);
    }

    private _registerPanelDisposeCleanup(
        uriKey: string,
        webviewPanel: vscode.WebviewPanel,
    ): void {
        webviewPanel.onDidDispose(() => {
            this._disposePanelState(uriKey);

            this._contentRequests.settleAll(uriKey);
            this._refreshStatusBar();
        });
    }

    private _disposePanelState(uriKey: string): void {
        this._webviewPanels.delete(uriKey);
        this._lastSaveTimes.delete(uriKey);
        this._webviewDirty.delete(uriKey);
        this._pushedContent.delete(uriKey);
        this._lastSavedContent.delete(uriKey);
        this._panelActive.delete(uriKey);
        this._imageUriMaps.delete(uriKey);
        this._frontmatterMap.delete(uriKey);
        this._initializedPanels.delete(uriKey);
        this._fallbackWarnedUris.delete(uriKey);
        this._navigation.dispose(uriKey);
        this._statusBar.dispose(uriKey);
        this._externalChange.dispose(uriKey);
    }

    private _registerViewStateHandler(
        document: MarkdownDocument,
        webviewPanel: vscode.WebviewPanel,
        uriKey: string,
    ): void {
        webviewPanel.onDidChangeViewState(({ webviewPanel: p }) => {

            this._panelActive.set(uriKey, p.active);
            try {
                p.webview.postMessage({ type: "panelActiveState", active: p.active });
            } catch {}
            if (!p.active) {

                if (this._webviewDirty.get(uriKey) === true) {
                    const cts = new vscode.CancellationTokenSource();
                    this._writeAudit.markSaveTrigger("flush-deactivate");
                    void this.saveCustomDocument(document, cts.token).finally(() => cts.dispose());
                }
                this._refreshStatusBar();
                return;
            }
            this._refreshStatusBar();
            if (!this._initializedPanels.has(uriKey)) { return; }

            if (this._externalChange.isDeferred(uriKey)) {
                this._externalChange.consumeDeferred(uriKey);
                void this._handleExternalChange(document, uriKey);
            }

            const line = this._consumePendingNavigation(document.uri.fsPath)
                ?? this._navigation.consumeGlobalRevealLine()
                ?? this._navigation.consumeLastTextLine(uriKey);
            if (line !== undefined) {
                p.webview.postMessage({ type: "scrollToLine", line });
            }
        });
    }

    private async _handleOpenFileMessage(document: MarkdownDocument, message: { path: string }): Promise<void> {
        await openPathLink(document.uri.fsPath, message.path, {
            viewType: MarkdownEditorProvider.viewType,
            setPendingNavigation: (fsPath, line) => this.setPendingNavigation(fsPath, line),
        });
    }

    private _registerFileWatcher(
        document: MarkdownDocument,
        webviewPanel: vscode.WebviewPanel,
        uriKey: string,
    ): void {
        const stopWatching = watchExternalWrites(document.uri.fsPath, () => {
            void this._handleExternalChange(document, uriKey);
        });
        webviewPanel.onDidDispose(stopWatching);
    }

    private async _handleExternalChange(document: MarkdownDocument, uriKey: string): Promise<void> {
        await this._externalChange.handle(document, uriKey);
    }

    private async _handleWebviewMessage(
        document: MarkdownDocument,
        webviewPanel: vscode.WebviewPanel,
        uriKey: string,
        message: ToExtensionMessage,
    ): Promise<void> {
        switch (message.type) {
            case "ready": {
                this._initializedPanels.add(uriKey);

                const pushedContent = this._pushedContent.get(uriKey);
                const memoryContent = document.getText();
                const initContent = pushedContent ?? memoryContent;
                if (pushedContent !== undefined && pushedContent !== memoryContent) {
                    document.update(pushedContent);
                    this._markDirty(document);
                } else if (pushedContent !== undefined) {

                    this._pushedContent.delete(uriKey);
                    this._webviewDirty.set(uriKey, false);
                }
                const displayContent = this._prepareContentForDisplay(initContent, document, webviewPanel, uriKey);
                const scrollToLine = this._consumePendingNavigation(document.uri.fsPath)
                    ?? this._navigation.consumeGlobalRevealLine();
                const cfg = vscode.workspace.getConfiguration("epytor");
                webviewPanel.webview.postMessage({
                    type: "init",
                    ...this._lifecyclePayload(uriKey, displayContent, computeDisplayLineRanges(initContent)),

                    active: webviewPanel.active,

                    serializationMode: sanitizeSerializationMode(cfg.get("serializationMode", "clean")),
                    ...(scrollToLine !== undefined ? { scrollToLine } : {}),
                });
                void this._refreshFileSize(document, uriKey);

                if (this._externalChange.isDeferred(uriKey)) {
                    this._externalChange.consumeDeferred(uriKey);
                    void this._handleExternalChange(document, uriKey);
                }
                break;
            }
            case "markDirty": {

                this._webviewDirty.set(uriKey, true);
                this._markDirty(document);
                break;
            }
            case "unsavedContent": {
                this._pushedContent.set(uriKey, message.content);
                this._webviewDirty.set(uriKey, true);
                break;
            }
            case "contentResponse": {
                if (this._contentRequests.has(uriKey)) {
                    this._contentRequests.resolve(
                        uriKey,
                        this._prepareContentForSave(message.content, uriKey),
                    );
                }
                break;
            }
            case "frontmatterUpdate": {
                const frontmatter = message.frontmatter ?? "";
                this._frontmatterMap.set(uriKey, frontmatter);

                const body = await this._requestContent(document, uriKey);
                const newContent = buildContentWithFrontmatter(
                    body,
                    frontmatter,
                    this._imageUriMaps.get(uriKey) ?? new Map(),
                );
                if (newContent === null) { break; }
                document.update(newContent);
                const cts = new vscode.CancellationTokenSource();
                try {
                    await this._saveNow(document, uriKey, cts.token, "frontmatter");
                } finally {
                    cts.dispose();
                }
                break;
            }
            case "openUrl":

                if (message.url && OPEN_URL_SCHEMES.has(extractUrlScheme(message.url))) {
                    fireAndLog(vscode.env.openExternal(vscode.Uri.parse(message.url)), "openExternal");
                }
                break;
            case "openFile": {
                if (!message.path) break;
                await this._handleOpenFileMessage(document, message);
                break;
            }
            case "switchToTextEditor": {

                const latest = await this._requestContent(document, uriKey);

                const diskText = await this._readDiskText(document);
                if (diskText !== undefined && shouldSkipSave({
                    content: latest,
                    lastSaved: this._lastSavedContent.get(uriKey),
                    diskText,
                })) {
                    console.warn("[epytor] switch-to-text flush skipped: nothing new since the last write");
                    this._auditWrite(uriKey, "skipped-noop", latest, {
                        lastSavedLen: this._lastSavedContent.get(uriKey)?.length ?? null,
                        diskLen: diskText.length,
                    });
                    this._webviewDirty.set(uriKey, false);
                } else {
                    document.update(latest);
                    const flushCts = new vscode.CancellationTokenSource();
                    try {
                        const saved = await this._saveNow(document, uriKey, flushCts.token, "switch-to-text");

                        if (!saved) break;
                    } finally {
                        flushCts.dispose();
                    }
                }
                const textDoc = await vscode.workspace.openTextDocument(document.uri);
                const opts: vscode.TextDocumentShowOptions = {
                    viewColumn: webviewPanel.viewColumn,
                    preserveFocus: false,
                };
                if (message.line && message.line > 0) {
                    const pos = new vscode.Position(message.line - 1, 0);
                    opts.selection = new vscode.Range(pos, pos);
                }

                if (message.line && message.line > 0) {
                    this._navigation.stashEditorReveal(document.uri.toString(), message.line);
                }
                try {
                    await vscode.commands.executeCommand('reopenActiveEditorWith', 'default');

                    if (this._navigation.hasPendingEditorReveal()) {
                        const active = vscode.window.activeTextEditor;
                        if (active) {
                            const pendingLine = this._navigation.takeEditorReveal(active.document.uri.toString());
                            if (pendingLine !== undefined) { revealLineAtTop(active, pendingLine); }
                        }
                    }
                } catch {

                    webviewPanel.dispose();
                    await vscode.window.showTextDocument(textDoc, opts);
                }
                break;
            }
            case "openSettings":
                fireAndLog(
                    vscode.commands.executeCommand('workbench.action.openSettings', 'epytor'),
                    "openSettings",
                );
                break;
            case "uploadImage":
                if (message.id && message.data) {
                    void handleImageUpload(
                        this._imageContext(document, webviewPanel, uriKey),
                        message.id,
                        message.data,
                        message.mimeType ?? 'image/png',
                        message.altText ?? '',
                    ).catch(logHandlerFailure("image upload"));
                }
                break;
            case "getProjectImages":
                if (message.id) {
                    void handleGetProjectImages(
                        this._imageContext(document, webviewPanel, uriKey),
                        message.id,
                    ).catch(logHandlerFailure("project images"));
                }
                break;
            case "renameImage":
                if (message.id && message.webviewUri && message.newBasename) {
                    void handleImageRename(
                        this._imageContext(document, webviewPanel, uriKey),
                        message.id,
                        message.webviewUri,
                        message.newBasename,
                    ).catch(logHandlerFailure("image rename"));
                }
                break;
            case "getPathSuggestions":
                if (message.id && message.query !== undefined) {
                    void handleGetPathSuggestions(
                        this._imageContext(document, webviewPanel, uriKey),
                        message.id,
                        message.query,
                    ).catch(logHandlerFailure("path suggestions"));
                }
                break;
            case "resolveImagePath":
                if (message.id && message.relPath) {
                    void handleResolveImagePath(
                        this._imageContext(document, webviewPanel, uriKey),
                        message.id,
                        message.relPath,
                    ).catch(logHandlerFailure("image path resolution"));
                }
                break;
            case "wordCount":
                this._statusBar.setWordCount(uriKey, {
                    lines: message.lines,
                    words: message.words,
                    charsNoSpace: message.charsNoSpace,
                    charsWithSpace: message.charsWithSpace,
                });
                break;
            case "viewportLine":
                this._navigation.recordPreviewLine(uriKey, message.line);
        }
    }

    private async _refreshFileSize(document: MarkdownDocument, uriKey: string): Promise<void> {
        await this._statusBar.refreshFileSize(document, uriKey);
    }

    private _refreshStatusBar(): void {
        this._statusBar.refresh();
    }

    private _markDirty(document: MarkdownDocument): void {
        this._onDidChangeCustomDocument.fire({
            document,
            label: "Edit",
            undo: () => {  },
            redo: () => {  },
        });
    }

    private _auditWrite(uriKey: string, reason: string, content: string, extra?: Record<string, unknown>): void {
        this._writeAudit.record(uriKey, reason, content, extra);
    }

    private async _saveNow(
        document: MarkdownDocument,
        uriKey: string,
        token: vscode.CancellationToken,
        reason = "unknown",
    ): Promise<boolean> {
        try {
            await document.save(token);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("[epytor] save failed:", message);

            this._markDirty(document);
            void vscode.window.showErrorMessage(
                vscode.l10n.t("Failed to save file: {0}", message),
            );
            return false;
        }
        this._lastSaveTimes.set(uriKey, Date.now());
        this._externalChange.clearDeferred(uriKey);
        this._webviewDirty.set(uriKey, false);
        this._pushedContent.delete(uriKey);

        this._lastSavedContent.set(uriKey, document.getText());
        this._auditWrite(uriKey, reason, document.getText(), { ok: true });
        this._postLineMapUpdate(document, uriKey);
        void this._refreshFileSize(document, uriKey);
        return true;
    }

    private _postLineMapUpdate(document: MarkdownDocument, uriKey: string): void {
        const panel = this._webviewPanels.get(uriKey);
        if (!panel) { return; }
        const ranges = computeDisplayLineRanges(document.getText());
        panel.webview.postMessage({
            type: "lineMapUpdate",
            lineMap: ranges.map((range) => range.start),
            lineEndMap: ranges.map((range) => range.end),
        });
    }

    private async _requestContent(document: MarkdownDocument, uriKey: string): Promise<string> {
        return (await this._requestContentDetailed(document, uriKey)).content;
    }

    private async _readDiskText(document: MarkdownDocument): Promise<string | undefined> {
        try {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            return Buffer.from(bytes).toString("utf-8");
        } catch {
            return undefined;
        }
    }

    private async _requestContentDetailed(
        document: MarkdownDocument,
        uriKey: string,
    ): Promise<{ content: string; authoritative: boolean }> {
        const panel = this._webviewPanels.get(uriKey);
        const pushed = this._pushedContent.get(uriKey);
        const fallback = pushed ?? document.getText();

        const canAskWebview = panel !== undefined
            && this._panelActive.get(uriKey) === true
            && this._initializedPanels.has(uriKey);
        if (!canAskWebview) {
            return { content: fallback, authoritative: false };
        }
        return this._contentRequests.requestDetailed(uriKey, fallback);
    }

    async saveCustomDocument(
        document: MarkdownDocument,
        cancellation: vscode.CancellationToken,
    ): Promise<void> {
        const uriKey = document.uri.toString();

        const trigger = this._writeAudit.consumeSaveTrigger();

        const content = await this._requestContent(document, uriKey);

        const lastSaved = this._lastSavedContent.get(uriKey);
        let diskText = document.getText();
        if (content === lastSaved) {
            diskText = (await this._readDiskText(document)) ?? diskText;
        }
        if (shouldSkipSave({
            content,
            lastSaved,
            diskText,
        })) {
            console.warn("[epytor] save skipped: nothing new since the last write");
            this._auditWrite(uriKey, "skipped-noop", content, {
                lastSavedLen: this._lastSavedContent.get(uriKey)?.length ?? null,
                diskLen: diskText.length,
            });
            this._webviewDirty.set(uriKey, false);
            return;
        }
        document.update(content);
        await this._saveNow(document, uriKey, cancellation, trigger);
    }

    async saveCustomDocumentAs(
        document: MarkdownDocument,
        destination: vscode.Uri,
        cancellation: vscode.CancellationToken,
    ): Promise<void> {

        const uriKey = document.uri.toString();
        const content = await this._requestContent(document, uriKey);
        document.update(content);
        await document.saveAs(destination, cancellation);
    }

    async revertCustomDocument(
        document: MarkdownDocument,
        cancellation: vscode.CancellationToken,
    ): Promise<void> {
        await document.revert(cancellation);
        const uriKey = document.uri.toString();
        this._webviewDirty.set(uriKey, false);
        this._pushedContent.delete(uriKey);

        this._lastSavedContent.set(uriKey, document.getText());
        const panel = this._webviewPanels.get(uriKey);
        if (panel) {
            const revertContent = document.getText();
            const displayContent = this._prepareContentForDisplay(revertContent, document, panel, uriKey);
            panel.webview.postMessage({
                type: "revert",
                ...this._lifecyclePayload(uriKey, displayContent, computeDisplayLineRanges(revertContent)),
            });
        }
    }

    private _lifecyclePayload(
        uriKey: string,
        content: string,
        ranges: LineRange[],
    ): { content: string; lineMap: number[]; lineEndMap: number[]; frontmatter: string | undefined; imageUriMap: Record<string, string> } {
        return {
            content,
            lineMap: ranges.map((range) => range.start),
            lineEndMap: ranges.map((range) => range.end),
            frontmatter: this._frontmatterMap.get(uriKey) || undefined,
            imageUriMap: Object.fromEntries(this._imageUriMaps.get(uriKey) ?? []),
        };
    }

    async backupCustomDocument(
        document: MarkdownDocument,
        context: vscode.CustomDocumentBackupContext,
        cancellation: vscode.CancellationToken,
    ): Promise<vscode.CustomDocumentBackup> {

        const uriKey = document.uri.toString();
        const content = await this._requestContent(document, uriKey);
        document.update(content);
        return document.backup(context.destination, cancellation);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        return buildEditorWebviewHtml(webview, this.context.extensionUri);
    }

    private _prepareContentForDisplay(
        content: string,
        document: MarkdownDocument,
        panel: vscode.WebviewPanel,
        uriKey: string,
    ): string {
        const { frontmatter, body } = extractFrontmatter(content);
        this._frontmatterMap.set(uriKey, frontmatter);

        content = convertTableBrForDisplay(body);

        if (document.uri.scheme !== 'file') { return content; }

        const workspaceRoot = resolveWorkspaceRoot(document.uri);

        return rewriteImageSources(content, (rawSrc) => {
            if (/^(https?:|data:|vscode-resource:|vscode-webview-)/.test(rawSrc)) { return undefined; }
            const src = normalizeImageDestination(rawSrc);
            try {
                const absPath = resolveDocPath(src, { docFsPath: document.uri.fsPath, workspaceRoot: workspaceRoot ?? null });
                const webviewUri = panel.webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
                this._registerImageMapping(uriKey, webviewUri, rawSrc);
                return webviewUri;
            } catch {

                return undefined;
            }
        });
    }

    private _registerImageMapping(uriKey: string, webviewUri: string, displayPath: string): void {
        let uriMap = this._imageUriMaps.get(uriKey);
        if (!uriMap) {
            uriMap = new Map<string, string>();
            this._imageUriMaps.set(uriKey, uriMap);
        }
        uriMap.set(webviewUri, displayPath);
    }

    private _prepareContentForSave(content: string, uriKey: string): string {
        const frontmatter = this._frontmatterMap.get(uriKey) ?? "";
        const uriMap = this._imageUriMaps.get(uriKey) ?? new Map<string, string>();
        return restoreContentForSave(content, frontmatter, uriMap);
    }

    private _imageContext(
        document: MarkdownDocument,
        panel: vscode.WebviewPanel,
        uriKey: string,
    ): ImageHandlerContext {
        return {
            documentUri: document.uri,
            panel,
            uriKey,
            registerImageMapping: (webviewUri, displayPath) =>
                this._registerImageMapping(uriKey, webviewUri, displayPath),
            getImageMapping: (webviewUri) => this._imageUriMaps.get(uriKey)?.get(webviewUri),
            deleteImageMapping: (webviewUri) => {
                this._imageUriMaps.get(uriKey)?.delete(webviewUri);
            },
        };
    }
}
