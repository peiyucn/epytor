/**
 * One-shot notice bar inside the webview (the Extension → WebView `notice` message).
 *
 * Used when, say, the image host target is degraded to local storage because it came from
 * workspace-level config: the warning has to appear in the editor the user is looking at
 * (host notifications get missed). The text is already localized by the Extension via
 * vscode.l10n and is written with `textContent` — never parsed as HTML.
 */
import "./notice.css";

/** Auto-dismiss delay (clicking the notice closes it early). */
const NOTICE_VISIBLE_MS = 8000;

let current: HTMLElement | null = null;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

/** Show a notice (only one at a time: a new one replaces the old). */
export function showNotice(message: string): void {
    dismissNotice();
    const el = document.createElement("div");
    el.className = "epytor-notice";
    el.setAttribute("role", "status");
    el.textContent = message;
    el.addEventListener("click", dismissNotice);
    document.body.appendChild(el);
    current = el;
    hideTimer = setTimeout(dismissNotice, NOTICE_VISIBLE_MS);
}

/** Remove the notice and clear the timer (safe to call repeatedly). */
export function dismissNotice(): void {
    if (hideTimer !== null) {
        clearTimeout(hideTimer);
        hideTimer = null;
    }
    current?.remove();
    current = null;
}
