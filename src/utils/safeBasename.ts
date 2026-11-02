/**
 * Windows-safe basename for image renames (pure, unit-tested).
 * Reserved device names stay illegal even with an extension (`CON.png`) and case-insensitively;
 * without the check the rename fails with a generic, user-facing error.
 */

const WINDOWS_RESERVED_STEM = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Empty string = unusable name; the caller then refuses with a user-visible message. */
export function sanitizeBasename(name: string): string {
    const cleaned = name
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "")
        .replace(/\.+$/, "")
        .trim();
    if (cleaned === "") return "";
    // The extension does not matter: `CON.png` is just as illegal.
    const stem = cleaned.split(".")[0];
    if (WINDOWS_RESERVED_STEM.test(stem)) return "";
    return cleaned;
}
