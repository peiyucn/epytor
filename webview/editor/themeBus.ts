
type ThemeListener = (isDark: boolean) => void;

const listeners = new Set<ThemeListener>();

function isDark(): boolean {
    return document.body.classList.contains("vscode-dark")
        || document.body.classList.contains("vscode-high-contrast");
}


export function isDarkTheme(): boolean {
    return isDark();
}


export function onThemeChange(fn: ThemeListener): () => void {
    fn(isDark());
    listeners.add(fn);
    return () => listeners.delete(fn);
}


export function getThemeListenerCount(): number {
    return listeners.size;
}


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
