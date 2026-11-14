/**
 * External-change adoption: compare the editor against the disk and decide what to do.
 *
 * Runs from the OS file watcher (debounced) and again when a panel becomes active after a
 * deferred decision, so a change that arrived while the editor could not be read is not lost.
 *
 * The decision itself is pure (`decideExternalChange`); this module is the side-effect half:
 * it owns the deferred/re-check bookkeeping, mutates the document model only for the actions
 * that are allowed to, and logs conflicts instead of interrupting the user with a notification.
 */
import * as vscode from "vscode";
import type { MarkdownDocument } from "../MarkdownDocument";
import type { ContentReply } from "../utils/contentRequestCoordinator";
import { decideExternalChange } from "../utils/externalChangeDecision";
import { computeDisplayLineRanges, type LineRange } from "../utils/lineMap";

/** Suppresses the fs.watch echo of our own writes. */
const SAVE_COOLDOWN_MS = 1500;

/** Delay before re-running a deferred check while the panel stays active. */
const EXTERNAL_CHANGE_RECHECK_MS = 1500;

/** Payload shared by init/revert, so the two paths cannot drift apart. */
export interface DisplayPayload {
    content: string;
    lineMap: number[];
    lineEndMap: number[];
    frontmatter: string | undefined;
    imageUriMap: Record<string, string>;
}

/**
 * Everything the coordinator needs from the provider. The provider keeps ownership of the
 * per-document maps and of panel/display plumbing; the coordinator only asks for what it needs.
 */
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
    /** Documents whose external change was deferred; re-checked on the next activation. */
    private readonly _deferred = new Set<string>();

    /** Documents that already had one automatic re-check after a defer (prevents a retry loop). */
    private readonly _deferredRetried = new Set<string>();

    constructor(private readonly host: ExternalChangeHost) {}

    /** Compare the document against the disk and act on a real external change. */
    async handle(document: MarkdownDocument, uriKey: string): Promise<void> {
        const { host } = this;
        // The deferred re-check timer may fire after the panel is gone; nothing left to sync.
        if (!host.getPanel(uriKey)) { return; }
        // Fast path: a disk event within SAVE_COOLDOWN_MS of our own save is almost surely its echo.
        // Correctness still rests on the content comparison below.
        const lastSave = host.getLastSaveTime(uriKey) ?? 0;
        if (Date.now() - lastSave < SAVE_COOLDOWN_MS) { return; }
        // Three-way comparison via decideExternalChange: webview content / last saved / disk.
        // Regression: keying off the debounced dirty flag alone sent a revert mid-typing (focus loss,
        // lost keystrokes) when a late OneDrive write slipped past the cooldown.
        const latestReply = await host.requestContentDetailed(document, uriKey);
        const latest = latestReply.content;
        // Read the disk instead of calling `document.revert()` first: reverting before the
        // decision replaced the model even on "ignore"/"defer", so a rebuild during the defer
        // window fed the disk copy to the editor — the exact "jumped back to the pre-edit state"
        // regression this decision exists to prevent. The model changes only for adoptDisk below.
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
            // Same bytes as the webview: our own echo, a sync-client rewrite, or an mtime touch.
            // Never revert here.
            return;
        }
        if (decision.action === "defer") {
            // We could not read the live editor (inactive panel, no push yet, or a pull
            // that timed out), so adopting the disk could visibly roll typing back.
            // Regression: the editor "jumped back to the pre-edit state".
            //
            // Touch nothing: the document model still holds the user's content, and marking it
            // dirty here would let an autoSave write a (possibly stale) buffer over whatever the
            // external writer just produced — the mirror-image regression, observed when another
            // session edited the same file. If the user really has unsaved edits, the webview's
            // own markDirty already carried them; the re-check on activation settles the rest.
            console.warn(`[epytor] external change deferred: ${decision.reason}`);
            this._deferred.add(uriKey);
            // A panel that is already active will not emit another activation event, so
            // re-check once here; otherwise a stale view could persist indefinitely.
            if (host.isPanelActive(uriKey) && !this._deferredRetried.has(uriKey)) {
                this._deferredRetried.add(uriKey);
                setTimeout(() => {
                    void this.handle(document, uriKey);
                }, EXTERNAL_CHANGE_RECHECK_MS);
            }
            return;
        }
        // Any non-deferred decision settles the pending re-check.
        this._deferred.delete(uriKey);
        this._deferredRetried.delete(uriKey);
        host.setWebviewDirty(uriKey, false);
        host.clearPushedContent(uriKey);
        if (decision.action === "keepUserContent") {
            // Unsaved user edits: keep them and report dirty to VS Code so closing prompts.
            // No notification: the owner's workflow has an AI writer on the same files, where a
            // modal warning per conflict is pure noise. Attribution lives in this log line.
            console.warn("[epytor] external change kept the editor buffer (unsaved edits)");
            document.update(latest);
            host.setWebviewDirty(uriKey, true);
            host.markDirty(document);
            void host.refreshFileSize(document, uriKey);
            return;
        }
        // Real external change: adopt the disk copy. The model must show it (the panel is
        // rebuilt from the model on ready), so update it from the one text we already read.
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

    /**
     * Read the on-disk text, or undefined when the file is momentarily unavailable
     * (OneDrive placeholder, delete/move). The next event re-evaluates.
     */
    private async _readDiskText(document: MarkdownDocument): Promise<string | undefined> {
        try {
            const bytes = await vscode.workspace.fs.readFile(document.uri);
            return Buffer.from(bytes).toString("utf-8");
        } catch (error) {
            console.warn("[epytor] external change skipped, file unavailable:", error);
            return undefined;
        }
    }

    /** Whether a deferred decision is waiting for the panel to become readable again. */
    isDeferred(uriKey: string): boolean {
        return this._deferred.has(uriKey);
    }

    /** Clear a deferred decision without acting on it (the caller re-checks immediately). */
    consumeDeferred(uriKey: string): void {
        this._deferred.delete(uriKey);
    }

    /** A save settled the document; a pending re-check is no longer needed. */
    clearDeferred(uriKey: string): void {
        this._deferred.delete(uriKey);
        this._deferredRetried.delete(uriKey);
    }

    /** Clear the per-document entries; called when the WYSIWYG panel is disposed. */
    dispose(uriKey: string): void {
        this.clearDeferred(uriKey);
    }
}
