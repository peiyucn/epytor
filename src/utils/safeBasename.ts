

const WINDOWS_RESERVED_STEM = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;


export function sanitizeBasename(name: string): string {
    const cleaned = Array.from(name)
        .filter((char) => char.charCodeAt(0) >= 0x20)
        .join("")
        .replace(/[<>:"/\\|?*]/g, "")
        .replace(/\.+$/, "")
        .trim();
    if (cleaned === "") return "";

    const stem = cleaned.split(".")[0];
    if (WINDOWS_RESERVED_STEM.test(stem)) return "";
    return cleaned;
}
