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

    context.subscriptions.push(
        vscode.commands.registerCommand(
            'revealLine',
            (args: { lineNumber: number; at?: string }) => {
                const targetLine = args.lineNumber + 1;
                MarkdownEditorProvider.current?.setGlobalRevealLine(targetLine);

                const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
                if (activeTab?.input instanceof vscode.TabInputCustom
                    && activeTab.input.viewType === MarkdownEditorProvider.viewType) {
                    MarkdownEditorProvider.current?.setPendingNavigation(
                        activeTab.input.uri.fsPath, targetLine, { directOnly: true });
                }

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

                const topVisibleLine = activeEditor?.visibleRanges[0]?.start.line
                    ?? activeEditor?.selection.active.line
                    ?? -1;
                if (topVisibleLine >= 0) {
                    MarkdownEditorProvider.current?.setPendingNavigation(target.fsPath, topVisibleLine + 1);
                }

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

                try {
                    await vscode.commands.executeCommand(
                        "reopenActiveEditorWith",
                        MarkdownEditorProvider.viewType,
                    );
                } catch {

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
