
export const CM_RECONFIGURE_DELAY_MS = 10;

function countCmEditors(container: HTMLElement): number {
    return container.querySelectorAll(".cm-editor").length;
}


export function observeCmEditorCount(container: HTMLElement, onChange: () => void): () => void {
    let lastCount = countCmEditors(container);
    const observer = new MutationObserver(() => {
        const count = countCmEditors(container);
        if (count === lastCount) return;
        lastCount = count;
        setTimeout(() => {
            lastCount = countCmEditors(container);
            onChange();
        }, CM_RECONFIGURE_DELAY_MS);
    });
    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
}
