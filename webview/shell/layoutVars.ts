
const VAR_EDITOR_MAX_WIDTH = "--editor-max-width";
const VAR_CODE_BLOCK_MAX_HEIGHT = "--code-block-max-height";

function applyPxVar(name: string, value: number): void {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) { return; }
    document.documentElement.style.setProperty(name, `${Math.round(value)}px`);
}


export function applyEditorMaxWidth(value: number): void {
    applyPxVar(VAR_EDITOR_MAX_WIDTH, value);
}


export function applyCodeBlockMaxHeight(value: number): void {
    applyPxVar(VAR_CODE_BLOCK_MAX_HEIGHT, value);
}
