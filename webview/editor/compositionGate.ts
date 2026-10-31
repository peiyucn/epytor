/**
 * IME composition gate.
 *
 * Regression: rebuilding the editor during an IME composition silently cancels it
 * (no compositionend, candidate window gone, focus back to body). Lifecycle rebuilds
 * await `whenIdle()` first; a timeout bounds the wait when compositionend never
 * arrives.
 */

/** Fallback timeout (ms) when compositionend never arrives. */
const COMPOSITION_WAIT_TIMEOUT_MS = 3000;

export interface CompositionGate {
    isComposing(): boolean;
    /** Resolve once composition ends (or the timeout fires); immediate when not composing. */
    whenIdle(): Promise<void>;
    dispose(): void;
}

export function createCompositionGate(
    targetDoc: Document = document,
    timeoutMs: number = COMPOSITION_WAIT_TIMEOUT_MS,
): CompositionGate {
    let composing = false;
    const waiters = new Set<() => void>();

    const flush = (): void => {
        const pending = [...waiters];
        waiters.clear();
        for (const resolve of pending) { resolve(); }
    };

    const onStart = (): void => { composing = true; };
    const onEnd = (): void => {
        composing = false;
        flush();
    };

    targetDoc.addEventListener("compositionstart", onStart, true);
    targetDoc.addEventListener("compositionend", onEnd, true);

    return {
        isComposing: () => composing,
        whenIdle: () => {
            if (!composing) { return Promise.resolve(); }
            return new Promise<void>((resolve) => {
                let settled = false;
                const finish = (): void => {
                    if (settled) { return; }
                    settled = true;
                    waiters.delete(finish);
                    clearTimeout(timer);
                    resolve();
                };
                const timer = setTimeout(finish, timeoutMs);
                waiters.add(finish);
            });
        },
        dispose: () => {
            targetDoc.removeEventListener("compositionstart", onStart, true);
            targetDoc.removeEventListener("compositionend", onEnd, true);
            composing = false;
            flush();
        },
    };
}
