
import * as vscode from "vscode";


const GLOBAL_REVEAL_LINE_TTL_MS = 10_000;

const PENDING_NAVIGATION_TTL_MS = 5000;

interface PendingLine {
    line: number;
    ts: number;
}


export function revealLineAtTop(editor: vscode.TextEditor, line: number): void {
    const target = Math.max(0, Math.min(line - 1, editor.document.lineCount - 1));
    const pos = new vscode.Position(target, 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.AtTop);
}

export class NavigationState {

    private readonly _pendingNavigations = new Map<string, PendingLine>();


    private _pendingRevealLine: PendingLine | undefined;


    private _pendingEditorReveal: { uriKey: string; line: number } | undefined;


    private readonly _lastPreviewLines = new Map<string, number>();
    private readonly _lastTextLines = new Map<string, number>();


    setGlobalRevealLine(line: number): void {
        this._pendingRevealLine = { line, ts: Date.now() };
    }

    consumeGlobalRevealLine(): number | undefined {
        const pending = this._pendingRevealLine;
        if (!pending) { return undefined; }
        this._pendingRevealLine = undefined;
        if (Date.now() - pending.ts > GLOBAL_REVEAL_LINE_TTL_MS) { return undefined; }
        return pending.line;
    }


    rememberPendingNavigation(uriKey: string, line: number): void {
        this._pendingNavigations.set(uriKey, { line, ts: Date.now() });
    }

    consumePendingNavigation(uriKey: string): number | undefined {
        const pending = this._pendingNavigations.get(uriKey);
        if (!pending) { return undefined; }
        this._pendingNavigations.delete(uriKey);
        if (Date.now() - pending.ts > PENDING_NAVIGATION_TTL_MS) { return undefined; }
        return pending.line;
    }

    recordPreviewLine(uriKey: string, line: number): void {
        this._lastPreviewLines.set(uriKey, line);
    }

    getPreviewLine(uriKey: string): number | undefined {
        return this._lastPreviewLines.get(uriKey);
    }

    recordTextLine(uriKey: string, line: number): void {
        this._lastTextLines.set(uriKey, line);
    }


    consumeLastTextLine(uriKey: string): number | undefined {
        const line = this._lastTextLines.get(uriKey);
        this._lastTextLines.delete(uriKey);
        return line;
    }

    stashEditorReveal(uriKey: string, line: number): void {
        this._pendingEditorReveal = { uriKey, line };
    }

    hasPendingEditorReveal(): boolean {
        return this._pendingEditorReveal !== undefined;
    }


    takeEditorReveal(uriKey: string): number | undefined {
        const pending = this._pendingEditorReveal;
        if (!pending || pending.uriKey !== uriKey) { return undefined; }
        this._pendingEditorReveal = undefined;
        return pending.line;
    }


    dispose(uriKey: string): void {
        this._pendingNavigations.delete(uriKey);
        this._lastPreviewLines.delete(uriKey);
        this._lastTextLines.delete(uriKey);
        if (this._pendingEditorReveal?.uriKey === uriKey) {
            this._pendingEditorReveal = undefined;
        }
    }
}
