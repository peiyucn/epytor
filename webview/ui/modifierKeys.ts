/**
 * Ctrl/Meta held state, shared by the CSS body class (`body.epytor-modifier-active`) and by
 * components that need the modifier state (path-link hover highlight).
 *
 * Regression: index.ts and pathLink each tracked the modifier on their own — one drove the body
 * class, the other a local `cmdHeld` flag — so a change to one (blur reset, which key counts)
 * silently desynced the other. pathLink now reads this single source.
 *
 * Page-lifecycle singleton: the webview document lives as long as the editor panel, so the
 * listeners are installed once and never torn down. Subscriptions are removable per component,
 * which keeps tests able to detach cleanly.
 */
const MODIFIER_ACTIVE_CLASS = "epytor-modifier-active";

export type ModifierListener = (active: boolean) => void;

let active = false;
let installed = false;
const listeners = new Set<ModifierListener>();

function setActive(next: boolean): void {
    if (next === active) {
        return;
    }
    active = next;
    document.body.classList.toggle(MODIFIER_ACTIVE_CLASS, active);
    for (const listener of [...listeners]) {
        listener(active);
    }
}

function onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey) {
        setActive(true);
    }
}

function onKeyUp(event: KeyboardEvent): void {
    if (!event.ctrlKey && !event.metaKey) {
        setActive(false);
    }
}

/** Cmd+Tab away: no keyup arrives, so reset on blur. */
function onWindowBlur(): void {
    setActive(false);
}

/**
 * Install the page-level key/blur listeners and body-class mirroring once.
 * Call this from index.ts instead of its local modifier listeners (index wiring is pending).
 */
export function installModifierKeyTracking(): void {
    if (installed) {
        return;
    }
    installed = true;
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
}

/** True while Ctrl (Windows/Linux) or Meta (macOS) is held. */
export function isModifierActive(): boolean {
    return active;
}

/**
 * Subscribe to held-state changes (fires only when the state flips).
 * Subscribing installs the page-level listeners. Returns an unsubscribe function.
 */
export function onModifierChange(listener: ModifierListener): () => void {
    installModifierKeyTracking();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
