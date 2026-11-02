/**
 * Page-lifecycle singleton theme bus.
 * No teardown by design; subscribers unsubscribe individually.
 */
type ThemeListener = (isDark: boolean) => void;

const listeners = new Set<ThemeListener>();

function isDark(): boolean {
    return document.body.classList.contains("vscode-dark")
        || document.body.classList.contains("vscode-high-contrast");
}

/** Whether the document is currently dark (initial value for creation, same test as the bus). */
export function isDarkTheme(): boolean {
    return isDark();
}

/** Subscribe to theme changes: the callback fires immediately, then on every change. Returns an unsubscribe function. */
export function onThemeChange(fn: ThemeListener): () => void {
    fn(isDark());
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Live listener count (test seam: rebuild must not leak subscriptions). */
export function getThemeListenerCount(): number {
    return listeners.size;
}

// One shared observer on body class changes.
let started = false;
function start(): void {
    if (started) return;
    started = true;
    let prev = isDark();
    new MutationObserver(() => {
        const now = isDark();
        if (now === prev) return;
        prev = now;
        listeners.forEach((fn) => fn(now));
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
}
start();
