
import * as vscode from "vscode";
import type { MarkdownDocument } from "../MarkdownDocument";
import type { ContentReply } from "../utils/contentRequestCoordinator";
import { decideExternalChange } from "../utils/externalChangeDecision";
import { computeDisplayLineRanges, type LineRange } from "../utils/lineMap";

const SAVE_COOLDOWN_MS = 1500;

const EXTERNAL_CHANGE_RECHECK_MS = 1500;

export interface DisplayPayload {
    content: string;
    lineMap: number[];
    lineEndMap: number[];
    frontmatter: string | undefined;
    imageUriMap: Record<string, string>;
}

export interface ExternalChangeHost {
    getPanel(uriKey: string): vscode.WebviewPanel | undefined;
    isPanelActive(uriKey: string): boolean;
    getLastSaveTime(uriKey: string): number | undefined;
    getLastSavedContent(uriKey: string): string | undefined;
    isWebviewDirty(uriKey: string): boolean;
    setWebviewDirty(uriKey: string, dirty: boolean): void;
    clearPushedContent(uriKey: string): void;
    seedLastSavedContent(uriKey: string, content: string): void;
    requestContentDetailed(document: MarkdownDocument, uriKey: string): Promise<ContentReply>;
    prepareContentForDisplay(
        document: MarkdownDocument,
        panel: vscode.WebviewPanel,
        uriKey: string,
        content: string,
    ): string;
    buildDisplayPayload(uriKey: string, content: string, ranges: LineRange[]): DisplayPayload;
    refreshFileSize(document: MarkdownDocument, uriKey: string): Promise<void>;
    markDirty(document: MarkdownDocument): void;
}

export class ExternalChangeCoordinator {

    private readonly _deferred = new Set<string>();

    private readonly _deferredRetried = new Set<string>();

    constructor(private readonly host: ExternalChangeHost) {}

    async handle(document: MarkdownDocument, uriKey: string): Promise<void> {
        const { host } = this;

        if (!host.getPanel(uriKey)) { return; }

        const lastSave = host.getLastSaveTime(uriKey) ?? 0;
        if (Date.now() - lastSave < SAVE_COOLDOWN_MS) { return; }

        const latestReply = await host.requestContentDetailed(document, uriKey);
        const latest = latestReply.content;

        const diskContent = await this._readDiskText(document);
        if (diskContent === undefined) { return; }
        const decision = decideExternalChange({
            latest,
            lastSaved: host.getLastSavedContent(uriKey),
            disk: diskContent,
            webviewDirty: host.isWebviewDirty(uriKey),
            latestAuthoritative: latestReply.authoritative,
        });
        if (decision.action === "ignore") {

            return;
        }
        if (decision.action === "defer") {

            console.warn(`[epytor] external change deferred: ${decision.reason}`);
            this._deferred.add(uriKey);

            if (host.isPanelActive(uriKey) && !this._deferredRetried.has(uriKey)) {
                this._deferredRetried.add(uriKey);
                setTimeout(() => {
                    void this.handle(document, uriKey);
                }, EXTERNAL_CHANGE_RECHECK_MS);
            }
            return;
        }

        this._deferred.delete(uriKey);
        this._deferredRetried.delete(uriKey);
        host.setWebviewDirty(uriKey, false);
        host.clearPushedContent(uriKey);
        if (decision.action === "keepUserContent") {

            console.warn("[epytor] external change kept the editor buffer (unsaved edits)");
            document.update(latest);
            host.setWebviewDirty(uriKey, true);
            host.markDirty(document);
            void host.refreshFileSize(document, uriKey);
            return;
        }

        document.update(diskContent);
        host.seedLastSavedContent(uriKey, diskContent);
        const panel = host.getPanel(uriKey);
        if (panel) {
            const displayContent = host.prepareContentForDisplay(document, panel, uriKey, diskContent);
            panel.webview.postMessage({
                type: "revert",
                ...host.buildDisplayPayload(uriKey, displayContent, computeDisplayLineRanges(diskContent)),
            });
        }
        void host.refreshFileSize(document, uriKey);
    }

    private async _readDiskText(document: MarkdownDocument): Promise<string | undefined> {
        try {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            return Buffer.from(bytes).toString("utf-8");
        } catch (error) {
            console.warn("[epytor] external change skipped, file unavailable:", error);
            return undefined;
        }
    }

    isDeferred(uriKey: string): boolean {
        return this._deferred.has(uriKey);
    }

    consumeDeferred(uriKey: string): void {
        this._deferred.delete(uriKey);
    }

    clearDeferred(uriKey: string): void {
        this._deferred.delete(uriKey);
        this._deferredRetried.delete(uriKey);
    }

    dispose(uriKey: string): void {
        this.clearDeferred(uriKey);
    }
}
