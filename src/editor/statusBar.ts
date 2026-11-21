
import * as vscode from "vscode";
import { composeStatusBarText, formatFileSize } from "../utils/fileSize";

export interface WordCount {
    lines: number;
    words: number;
    charsNoSpace: number;
    charsWithSpace: number;
}

export class StatusBarPresenter {
    private readonly _item: vscode.StatusBarItem;

    private readonly _wordCounts = new Map<string, WordCount>();

    private readonly _fileSizes = new Map<string, number>();

    constructor(private readonly getActiveUriKey: () => string | undefined) {
        this._item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this._item.hide();
    }

    setWordCount(uriKey: string, wordCount: WordCount): void {
        this._wordCounts.set(uriKey, wordCount);
        this.refresh();
    }

    async refreshFileSize(document: { uri: vscode.Uri }, uriKey: string): Promise<void> {
        try {
            const stat = await vscode.workspace.fs.stat(document.uri);
            this._fileSizes.set(uriKey, stat.size);
        } catch {
            this._fileSizes.delete(uriKey);
        }
        this.refresh();
    }

    refresh(): void {
        const activeKey = this.getActiveUriKey();
        const wordCount = activeKey ? this._wordCounts.get(activeKey) : undefined;
        if (!wordCount) {
            this._item.hide();
            return;
        }
        const base = vscode.l10n.t(
            "Lines(src): {0}  Words: {1}  Chars: {2}",
            wordCount.lines,
            wordCount.words.toLocaleString(),
            wordCount.charsNoSpace.toLocaleString(),
        );
        const size = activeKey ? formatFileSize(this._fileSizes.get(activeKey)) : null;
        this._item.text = composeStatusBarText(
            base,
            size,
            (value) => vscode.l10n.t("Size: {0}", value),
        );
        this._item.tooltip = vscode.l10n.t("Chars (with spaces): {0}", wordCount.charsWithSpace.toLocaleString());
        this._item.show();
    }

    dispose(uriKey: string): void {
        this._wordCounts.delete(uriKey);
        this._fileSizes.delete(uriKey);
    }
}
