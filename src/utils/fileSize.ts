

const KB = 1024;
const MB = KB * KB;


export function formatFileSize(bytes: number | undefined | null): string | null {
    if (bytes === undefined || bytes === null) { return null; }
    if (typeof bytes !== "number" || !Number.isFinite(bytes)) { return null; }
    if (bytes < 0) { return null; }

    const size = Math.floor(bytes);
    if (size < KB) { return `${size} B`; }
    if (size < MB) { return `${(size / KB).toFixed(1)} KB`; }
    return `${(size / MB).toFixed(1)} MB`;
}


export function composeStatusBarText(
    base: string,
    size: string | null,
    sizeLabel: (size: string) => string,
): string {
    if (size === null) { return base; }
    return `${base}  ${sizeLabel(size)}`;
}
