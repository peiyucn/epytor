import * as vscode from "vscode";
import { MarkdownEditorProvider } from "./MarkdownEditorProvider";
import {
    DEFAULT_CODE_BLOCK_MAX_HEIGHT,
    DEFAULT_EDITOR_MAX_WIDTH,
    MIN_CODE_BLOCK_MAX_HEIGHT,
    MIN_EDITOR_MAX_WIDTH,
    sanitizeCssNumber,
    sanitizeSerializationMode,
} from "./utils/webviewConfigSanitize";
import type { ToWebviewMessage } from "../shared/messages";
import { normalizeTableWrapMode } from "../shared/tableWrap";

/** Table-driven config broadcast: one row per setting, keyed by fully-qualified config key. */
export const CONFIG_BROADCASTS: ReadonlyArray<{
    section: string;
    message: (value: unknown) => ToWebviewMessage;
}> = [
    {
        section: "epytor.serializationMode",
        message: (value) => ({ type: "setSerializationMode", mode: sanitizeSerializationMode(value) }),
    },
    {
        section: "epytor.tableWrapMode",
        message: (value) => ({ type: "tableWrapModeChanged", mode: normalizeTableWrapMode(value) }),
    },
    {
        section: "epytor.editorMaxWidth",
        message: (value) => ({
            type: "editorMaxWidthChanged",
            value: sanitizeCssNumber(value, DEFAULT_EDITOR_MAX_WIDTH, MIN_EDITOR_MAX_WIDTH),
        }),
    },
    {
        section: "epytor.codeBlockMaxHeight",
        message: (value) => ({
            type: "codeBlockMaxHeightChanged",
            value: sanitizeCssNumber(value, DEFAULT_CODE_BLOCK_MAX_HEIGHT, MIN_CODE_BLOCK_MAX_HEIGHT),
        }),
    },
];

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        MarkdownEditorProvider.register(context),
    );

    // `priority: default` opens .md directly as WYSIWYG: no "text tab → convert" phase,
    // which was the root of open-flash / double tab / focus ping-pong.
    // The user picks the default editor in VS Code itself; we never rewrite
    // `workbench.editorAssociations`. The previous onDidChangeActiveTextEditor
    // line-report listener and its ExpiryWindowMap existed only for the removed
    // intermediate state, so both are gone.

    // Intercept `revealLine` so "go to match" from global search lands correctly.
    // Ownership falls out of who holds `activeTextEditor`:
    //   - a custom-editor match → no activeTextEditor; the line goes to the global
    //     reveal slot and is consumed when a panel becomes ready/active
    //   - a text-editor match (source-mode md, .ts, …) → revealRange positions directly
    // Regression: broadcasting to every md panel swallowed non-md navigations.
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'revealLine',
            (args: { lineNumber: number; at?: string }) => {
                const targetLine = args.lineNumber + 1; // 1-indexed
                MarkdownEditorProvider.current?.setGlobalRevealLine(targetLine);
                // Same-document search inside the active md panel: deliver straight away.
                // `directOnly` keeps a stale entry from polluting a later activation.
                const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
                if (activeTab?.input instanceof vscode.TabInputCustom
                    && activeTab.input.viewType === MarkdownEditorProvider.viewType) {
                    MarkdownEditorProvider.current?.setPendingNavigation(
                        activeTab.input.uri.fsPath, targetLine, { directOnly: true });
                }
                // Text-editor fallback: no-op when a custom md tab is active.
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    const pos = new vscode.Position(args.lineNumber, 0);
                    const revealType =
                        args.at === 'top' ? vscode.TextEditorRevealType.AtTop
                        : args.at === 'center' ? vscode.TextEditorRevealType.InCenter
                        : vscode.TextEditorRevealType.Default;
                    editor.revealRange(new vscode.Range(pos, pos), revealType);
                }
            },
        ),
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            for (const item of CONFIG_BROADCASTS) {
                if (!e.affectsConfiguration(item.section)) { continue; }
                const value = vscode.workspace.getConfiguration().get(item.section);
                MarkdownEditorProvider.current?.postToAll(item.message(value));
            }
        }),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "epytor.switchToTextEditor",
            async (uri?: vscode.Uri) => {
                let target =
                    uri ?? vscode.window.activeTextEditor?.document.uri;
                if (!target) {
                    // With a custom editor active there is no activeTextEditor; find its tab.
                    for (const group of vscode.window.tabGroups.all) {
                        const activeTab = group.activeTab;
                        if (activeTab?.input instanceof vscode.TabInputCustom) {
                            target = activeTab.input.uri;
                            break;
                        }
                    }
                }
                if (!target) { return; }

                const provider = MarkdownEditorProvider.current;
                // Ask the webview for its scroll line; it replies with switchToTextEditor and
                // the provider then flushes content, closes the WYSIWYG tab and reopens as text
                // (pull-based saving means the content must be on disk before switching).
                // Regression: a truthy `provider` check made the command a silent no-op for
                // documents without a panel; check for a real panel instead.
                if (provider?.hasPanel(target)) {
                    provider.postToPanel(target, { type: "requestSwitchToTextEditor" });
                    return;
                }

                await vscode.commands.executeCommand("vscode.openWith", target, "default");
            },
        ),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            "epytor.switchToPreview",
            async (uri?: vscode.Uri) => {
                const activeEditor = vscode.window.activeTextEditor;
                const target = uri ?? activeEditor?.document.uri;
                if (!target) {
                    return;
                }
                // Record the *top visible* line, not the caret: it matches the built-in
                // Markdown preview's scroll hand-off.
                // Regression: using `selection.active.line` jumped to a different place
                // whenever the caret sat outside the viewport.
                const topVisibleLine = activeEditor?.visibleRanges[0]?.start.line
                    ?? activeEditor?.selection.active.line
                    ?? -1;
                if (topVisibleLine >= 0) {
                    MarkdownEditorProvider.current?.setPendingNavigation(target.fsPath, topVisibleLine + 1);
                }
                // Reuse the text tab's preview flag and column on the fallback path.
                let isPreview = false;
                let viewCol: vscode.ViewColumn = vscode.ViewColumn.Active;
                let textTab: vscode.Tab | undefined;
                for (const group of vscode.window.tabGroups.all) {
                    for (const tab of group.tabs) {
                        if (
                            tab.input instanceof vscode.TabInputText &&
                            tab.input.uri.toString() === target.toString()
                        ) {
                            isPreview = tab.isPreview;
                            viewCol = group.viewColumn;
                            textTab = tab;
                            break;
                        }
                    }
                }
                // Swap the editor type in place (`reopenActiveEditorWith`), the same mechanism
                // as VS Code's built-in markdown.togglePreview: no tab rebuild, no flash.
                // Regression: closing the text tab and calling openWith rebuilt the whole
                // webview, which flashed and left a duplicate tab behind.
                try {
                    await vscode.commands.executeCommand(
                        "reopenActiveEditorWith",
                        MarkdownEditorProvider.viewType,
                    );
                } catch {
                    // Older VS Code without that command: close then reopen.
                    if (textTab) {
                        await vscode.window.tabGroups.close(textTab);
                    }
                    await vscode.commands.executeCommand(
                        "vscode.openWith",
                        target,
                        MarkdownEditorProvider.viewType,
                        { viewColumn: viewCol, preview: isPreview },
                    );
                }
            },
        ),
    );
}

export function deactivate() {}
