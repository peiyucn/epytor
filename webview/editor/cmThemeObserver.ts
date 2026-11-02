/** Delay before reconfiguring themes when the `.cm-editor` count changes (lets Crepe finish mounting). */
export const CM_RECONFIGURE_DELAY_MS = 10;

function countCmEditors(container: HTMLElement): number {
    return container.querySelectorAll(".cm-editor").length;
}

/**
 * Call onChange after the number of `.cm-editor` elements in `container` changes.
 * Crepe's codeMirror feature evaluates `theme.of(...)` only at registration, so code
 * blocks created after a theme switch keep the old theme.
 *
 * Regression: scheduling onChange on every DOM mutation created an infinite 10ms loop
 * (reconfigure itself mutates the DOM), burning CPU in background webviews; the count
 * guard cuts it because reconfigure does not change the count.
 *
 * @returns disconnect function; call it before rebuilding the editor.
 */
export function observeCmEditorCount(container: HTMLElement, onChange: () => void): () => void {
    let lastCount = countCmEditors(container);
    const observer = new MutationObserver(() => {
        const count = countCmEditors(container);
        if (count === lastCount) return; // reconfigure's own mutations: loop stops here
        lastCount = count;
        setTimeout(() => {
            lastCount = countCmEditors(container);
            onChange();
        }, CM_RECONFIGURE_DELAY_MS);
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
}
