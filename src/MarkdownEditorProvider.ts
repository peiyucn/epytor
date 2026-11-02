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

/** Keep in sync with the document selector in package.json. */
function isMarkdownDocument(document: vscode.TextDocument): boolean {
    const name = document.uri.path.toLowerCase();
    return name.endsWith(".md") || name.endsWith(".markdown");
}

/** Fire-and-forget handler failures used to vanish; log them instead of swallowing. */
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

    // Single-flight pulls with a waiter queue: concurrent saves share one response instead of hanging.
    private readonly _contentRequests: ContentRequestCoordinator;

    private readonly _webviewPanels = new Map<string, vscode.WebviewPanel>();

    // Suppresses the fs.watch echo of our own writes (see SAVE_COOLDOWN_MS).
    private readonly _lastSaveTimes = new Map<string, number>();
    /**
     * Whether the webview holds unsaved edits, set by the lightweight `markDirty` message.
     * External-change adoption trusts only this flag: comparing serialized text misfires on
     * Markdown normalization (`~` -> `\~`), which let autosave overwrite external (AI) writes.
     */
    private readonly _webviewDirty = new Map<string, boolean>();
    /**
     * Content the webview pushed while dirty (`unsavedContent`): the only copy of those edits
     * once the webview is gone, so it seeds a rebuilt editor and backs saving/backup when the
     * panel cannot be asked.
     */
    private readonly _pushedContent = new Map<string, string>();
    /**
     * Text we last wrote to disk (or the on-disk text at open). Byte-comparing the webview's
     * serialized result against this is the only sound way to separate "user edited" from
     * "disk changed" (see decideExternalChange).
     */
    private readonly _lastSavedContent = new Map<string, string>();
    /**
     * Whether the panel is active - not "webview exists" (keep-alive keeps it alive), but the
     * conservative gate for waiting on a reply (see `canAskWebview`).
     */
    private readonly _panelActive = new Map<string, boolean>();

    // webviewUri -> the path string written in the document; key is the document uriKey.
    private readonly _imageUriMaps = new Map<string, Map<string, string>>();
    private readonly _frontmatterMap = new Map<string, string>();

    /** Pending scroll targets and last-seen viewport lines, kept by a dedicated state owner. */
    private readonly _navigation = new NavigationState();

    private readonly _initializedPanels = new Set<string>();

    public static current: MarkdownEditorProvider | null = null;

    /** Called from extension.ts; consumed by the next panel activation. */
    public setGlobalRevealLine(line: number): void {
        this._navigation.setGlobalRevealLine(line);
    }

    /**
     * Stash a pending scroll target; deliver immediately when the panel is visible.
     * `directOnly` keeps a delivered target out of the queue so it cannot pollute a later
     * activation, while an undelivered one is still stashed.
     */
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

    /** Whether a WYSIWYG panel is open. Commands must check this, not provider truthiness. */
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
                    // Keep-alive is required: destroying the webview loses undo history and collapsed headings,
                    // and rebuilds Milkdown (~1s on long documents). Old hosts (~1.136) briefly re-layout the body
                    // at 300x150 when re-showing; webview/style.css guards only geometry (scroll anchoring,
                    // scrollbars, widths) because hiding the body looked worse than the reflow.
                    retainContextWhenHidden: true,
                },
                supportsMultipleEditorsPerDocument: false,
            },
        );
        // Config broadcasts live in extension.ts (CONFIG_BROADCASTS), not here.
        return disposable;
    }

    private readonly _statusBar: StatusBarPresenter;

    /** Write attribution log; the 2 MB cap rotates it instead of growing without bound. */
    private readonly _writeAudit: WriteAudit;

    /** External-change decisions and their deferred/re-check bookkeeping. */
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
        // Reveal only once the text editor is active and laid out (see `_pendingEditorReveal`).
        this.context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (!editor) { return; }
                const uriKey = editor.document.uri.toString();
                // 1) An explicit "switch to source" line wins.
                const pendingLine = this._navigation.takeEditorReveal(uriKey);
                if (pendingLine !== undefined) {
                    revealLineAtTop(editor, pendingLine);
                    return;
                }
                // 2) Otherwise use the line the webview last reported (covers Reopen With and tab menus).
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

    /** Explicit dependency bag for the external-change coordinator (state stays provider-owned). */
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

    /** Uri key of the active panel, or undefined when none is active. */
    private _activePanelUriKey(): string | undefined {
        for (const [key, panel] of this._webviewPanels) {
            try {
                if (panel.active) { return key; }
            } catch {
                // Panel already disposed (switch/close race).
            }
        }
        return undefined;
    }

    /** Documents already warned about a stale-content save (once per document per session). */
    private readonly _fallbackWarnedUris = new Set<string>();

    /** A save completed from memory after a pull timeout; warn that the content may be stale. */
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
        // Non-file documents (git diff, virtual URIs): render blank and do NOT dispose.
        // Disposing crashes the diff engine's claimWebview.
        if (document.uri.scheme !== 'file') {
            webviewPanel.webview.html = '<!DOCTYPE html><html><body></body></html>';
            return;
        }

        const uriKey = document.uri.toString();
        this._webviewPanels.set(uriKey, webviewPanel);
        this._lastSavedContent.set(uriKey, document.getText());
        // Opening a panel also proves the audit trail works: if this line never shows up, an
        // absent log later means "instrument broken", not "epytor did not write".
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
                // A throwing branch would otherwise become an unhandled rejection with no
                // trace: `postMessage` rejects once the panel is gone, and image/path
                // handlers do I/O. Log instead of letting it escape this entry point.
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
            // Settle pending pulls; the panel is gone, so they fall back to memory.
            this._contentRequests.settleAll(uriKey);
            this._refreshStatusBar();
        });
    }

    /**
     * Clear every per-uri container. Any new `Map`/`Set` keyed by `uriKey` must be added
     * here: a leftover `_webviewDirty` entry made a reopened document look dirty on the
     * extension side, which triggered "save on deactivate" with stale content
     * (Regression: edits written back while the user had not saved).
     */
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

    /** Active/inactive transitions: status bar, focus sync, and pending scroll targets. */
    private _registerViewStateHandler(
        document: MarkdownDocument,
        webviewPanel: vscode.WebviewPanel,
        uriKey: string,
    ): void {
        webviewPanel.onDidChangeViewState(({ webviewPanel: p }) => {
            // Push activation state so a background webview cannot steal focus by calling window.focus().
            this._panelActive.set(uriKey, p.active);
            try {
                p.webview.postMessage({ type: "panelActiveState", active: p.active });
            } catch {
                // Panel already disposed (switch/close race).
            }
            if (!p.active) {
                // Flush on deactivate: closing the tab, switching to source, or quitting drops the webview,
                // and the dirty flag alone does not carry content. This usually saves the pushed copy rather
                // than a live pull, so the last <400ms of typing may be missing.
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
            // A deferred external change (we could not read the editor last time) is re-evaluated
            // now that the webview can answer.
            if (this._externalChange.isDeferred(uriKey)) {
                this._externalChange.consumeDeferred(uriKey);
                void this._handleExternalChange(document, uriKey);
            }
            // Priority: explicit navigation > global reveal fallback > text editor viewport line
            // (the last is read-and-clear so later activations do not snap back).
            const line = this._consumePendingNavigation(document.uri.fsPath)
                ?? this._navigation.consumeGlobalRevealLine()
                ?? this._navigation.consumeLastTextLine(uriKey);
            if (line !== undefined) {
                p.webview.postMessage({ type: "scrollToLine", line });
            }
        });
    }

    /** Open a path link: `.md` in WYSIWYG, other files in the text editor; honor a numeric `#<line>` fragment. */
    private async _handleOpenFileMessage(document: MarkdownDocument, message: { path: string }): Promise<void> {
        await openPathLink(document.uri.fsPath, message.path, {
            viewType: MarkdownEditorProvider.viewType,
            setPendingNavigation: (fsPath, line) => this.setPendingNavigation(fsPath, line),
        });
    }

    /** Watch external writes (AI tools included), debounce, then adopt via revert. */
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

    /** Compare the editor against the disk and act on a real external change (see coordinator). */
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
                // Only a real webview rebuild reaches ready (keep-alive survives tab switches). Restore from
                // the pushed copy when it differs from memory: _markDirty flags a change but does not move
                // content into the document, so a rebuild would otherwise come back stale.
                const pushedContent = this._pushedContent.get(uriKey);
                const memoryContent = document.getText();
                const initContent = pushedContent ?? memoryContent;
                if (pushedContent !== undefined && pushedContent !== memoryContent) {
                    document.update(pushedContent);
                    this._markDirty(document);
                } else if (pushedContent !== undefined) {
                    // Same as memory: a rebuild only. Marking dirty here made idle documents hit a pull
                    // timeout ("editor not responding").
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
                    // Initial focus state; later changes arrive via `panelActiveState`.
                    active: webviewPanel.active,
                    // Send runtime config with init so a revert does not roll back a mid-session change.
                    serializationMode: sanitizeSerializationMode(cfg.get("serializationMode", "clean")),
                    ...(scrollToLine !== undefined ? { scrollToLine } : {}),
                });
                void this._refreshFileSize(document, uriKey);
                break;
            }
            case "markDirty": {
                // Lightweight dirty flag; content is pulled only at save time.
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
                // Pull the body first: memory can lag unpushed webview edits and would overwrite them.
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
                // Regression: any URI reached openExternal, including file:, javascript:, and custom schemes.
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
                // Text editors read from disk, so flush the pulled webview content first.
                const latest = await this._requestContent(document, uriKey);
                // Mirror-image regression: flushing a buffer that adds nothing on top of our last
                // write while the disk already moved on would undo the external change, and the
                // text editor opened next would show that rolled-back file.
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
                        // Abort the switch when the flush failed; continuing silently broke the interaction.
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

                // Replace the editor type in place (like markdown.togglePreview): no tab rebuild, no flash.
                // Reveal is deferred to the activeTextEditor listener; right after the reopen command the
                // first layout would drop it, stranding the viewport at the top of the file.
                // Regression: dispose-then-show flashed and left a duplicate tab.
                if (message.line && message.line > 0) {
                    this._navigation.stashEditorReveal(document.uri.toString(), message.line);
                }
                try {
                    await vscode.commands.executeCommand('reopenActiveEditorWith', 'default');
                    // Command fired no event (old VS Code): apply once, unless the listener already did.
                    if (this._navigation.hasPendingEditorReveal()) {
                        const active = vscode.window.activeTextEditor;
                        if (active) {
                            const pendingLine = this._navigation.takeEditorReveal(active.document.uri.toString());
                            if (pendingLine !== undefined) { revealLineAtTop(active, pendingLine); }
                        }
                    }
                } catch {
                    // Fallback for hosts without reopenActiveEditorWith.
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

    /** Report an edit to VS Code; saving itself is driven by Cmd+S / files.autoSave. */
    private _markDirty(document: MarkdownDocument): void {
        this._onDidChangeCustomDocument.fire({
            document,
            label: "Edit",
            undo: () => { /* TODO */ },
            redo: () => { /* TODO */ },
        });
    }

    /** Append one line per write attempt; see WriteAudit for the attribution purpose. */
    private _auditWrite(uriKey: string, reason: string, content: string, extra?: Record<string, unknown>): void {
        this._writeAudit.record(uriKey, reason, content, extra);
    }

    /**
     * The single save primitive (save / frontmatter update / flush before switching): writes,
     * records timestamp + snapshot, broadcasts line maps. On failure it marks dirty, shows an
     * error, and returns false so the caller can abort.
     */
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
            // Memory now differs from disk: keep VS Code dirty so closing prompts.
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
        // document.save() wrote exactly document.getText().
        this._lastSavedContent.set(uriKey, document.getText());
        this._auditWrite(uriKey, reason, document.getText(), { ok: true });
        this._postLineMapUpdate(document, uriKey);
        void this._refreshFileSize(document, uriKey);
        return true;
    }

    /** Broadcast display line ranges; lineMap and lineEndMap are parallel arrays. */
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

    /**
     * Pull the webview's serialized content; falls back to the pushed copy or memory on timeout.
     * Concurrent callers share one in-flight request via ContentRequestCoordinator.
     */
    private async _requestContent(document: MarkdownDocument, uriKey: string): Promise<string> {
        return (await this._requestContentDetailed(document, uriKey)).content;
    }

    /** Read the on-disk text; undefined when unreadable (the caller then keeps its normal path). */
    private async _readDiskText(document: MarkdownDocument): Promise<string | undefined> {
        try {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            return Buffer.from(bytes).toString("utf-8");
        } catch {
            return undefined;
        }
    }

    /**
     * Same pull, but reports whether the content really came from the webview.
     *
     * The fallback copy can be up to the push debounce older than what the user sees, so it must
     * not be used to decide whether there are unsaved edits.
     */
    private async _requestContentDetailed(
        document: MarkdownDocument,
        uriKey: string,
    ): Promise<{ content: string; authoritative: boolean }> {
        const panel = this._webviewPanels.get(uriKey);
        const pushed = this._pushedContent.get(uriKey);
        const fallback = pushed ?? document.getText();
        // Only wait on a panel that exists, is active, and sent ready. Waiting otherwise makes idle
        // documents time out into "editor not responding". Conservative by design: the last <400ms of
        // typing may be missing from this save.
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
        // Save reason for the write audit; a deactivation flush sets it just before calling us.
        const trigger = this._writeAudit.consumeSaveTrigger();
        // Pull first: memory can lag unsaved webview edits.
        const content = await this._requestContent(document, uriKey);
        // Never write a buffer identical to our last write while the disk has moved on: a flush
        // on a stale dirty flag would otherwise undo an external change. Only a no-new-content
        // save needs the real disk copy: `document.getText()` can lag an external change that
        // has not been adopted yet, while a real edit below cannot be rolled back by this guard.
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
        // Pull before saveAs, otherwise the written file misses recent edits.
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
        // Disk is now the document: resync the snapshot so later watcher checks do not misfire.
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

    /**
     * Shared payload for init/revert. `ranges` are display block ranges; lineMap/lineEndMap are
     * parallel so scroll sync can interpolate within a block (like the built-in preview).
     */
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
        // Pull first: a backup from memory would drop recent edits (lost on hot exit).
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
        // remark-gfm drops <br> in table cells; convert to &#10; so display round-trips.
        content = convertTableBrForDisplay(body);

        if (document.uri.scheme !== 'file') { return content; }
        // Standalone files must not borrow the first open folder's root: their `@/` falls back
        // to the document directory (E2E 2026-10-31: images in an outside-workspace doc 404'd).
        const workspaceRoot = resolveWorkspaceRoot(document.uri);
        // Replace src per image; the regex must allow spaces/nested parens and leave the title alone.
        // Regression: a [^)\s"]+ pattern truncated paths with spaces and swallowed titles (404s).
        // uriMap keeps the raw document spelling even when normalization resolves the path.
        return rewriteImageSources(content, (rawSrc) => {
            if (/^(https?:|data:|vscode-resource:|vscode-webview-)/.test(rawSrc)) { return undefined; }
            const src = normalizeImageDestination(rawSrc);
            try {
                const absPath = resolveDocPath(src, { docFsPath: document.uri.fsPath, workspaceRoot: workspaceRoot ?? null });
                const webviewUri = panel.webview.asWebviewUri(vscode.Uri.file(absPath)).toString();
                this._registerImageMapping(uriKey, webviewUri, rawSrc);
                return webviewUri;
            } catch {
                // Unresolvable: keep the original src and do not register it.
                return undefined;
            }
        });
    }

    /**
     * The only writer of the image uriMap: webviewUri -> the exact string to write back into the
     * document. Callers differ in origin (raw file text vs. a new relative path) but must pass
     * what belongs in the document.
     */
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

    /** Explicit dependency bag for the image handlers; keeps panel and uri-map access visible. */
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
