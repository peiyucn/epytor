
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

function onWindowBlur(): void {
    setActive(false);
}

export function installModifierKeyTracking(): void {
    if (installed) {
        return;
    }
    installed = true;
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);
}

export function isModifierActive(): boolean {
    return active;
}

export function onModifierChange(listener: ModifierListener): () => void {
    installModifierKeyTracking();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
