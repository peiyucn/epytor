/**
 * First-frame HTML for the webview (pure, no vscode dependency, so tests can pin the frame).
 *
 * The first frame renders only the themed background — no spinner or overlay while rebuilding —
 * matching VS Code's built-in Markdown preview.
 *
 * Callers must pass sanitized values: config via webviewConfigSanitize, `i18nScript` via JSON.stringify.
 */
export interface WebviewHtmlOptions {
    language: string;
    cspSource: string;
    nonce: string;
    styleUri: string;
    scriptUri: string;
    i18nScript: string;
    cssVars: Record<string, string>;
}

export function buildWebviewHtml(options: WebviewHtmlOptions): string {
    const { language, cspSource, nonce, styleUri, scriptUri, i18nScript, cssVars } = options;
    const cssVarDecls = Object.entries(cssVars)
        .map(([name, value]) => `${name}: ${value};`)
        .join(" ");

    return `<!DOCTYPE html>
<html lang="${language}" style="background-color: var(--vscode-editor-background);">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
             style-src ${cspSource} 'unsafe-inline';
             script-src 'nonce-${nonce}' ${cspSource};
             img-src ${cspSource} https: data:;">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown Editor</title>
  <link rel="stylesheet" href="${styleUri}">
  <style>:root { ${cssVarDecls} }</style>
</head>
<body style="margin: 0; background-color: var(--vscode-editor-background);">
  <div class="editor-topbar"></div>
  <div id="editor"></div>
  <script nonce="${nonce}">${i18nScript}</script>
  <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
