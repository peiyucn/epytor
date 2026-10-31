import type { SerializationMode } from "../markdown/markdownSerializer";

declare global {
    interface Window {
        __i18n?: {
            translations: Record<string, string>;
            isMac: boolean;
            serializationMode?: SerializationMode;
        };
    }
}

const _t: Record<string, string> = window.__i18n?.translations ?? {};
const _isMac: boolean = window.__i18n?.isMac ?? false;

/** Translate a key; unknown keys fall back to the key itself, i.e. the English source text. */
export function t(key: string): string {
    return _t[key] ?? key;
}

/**
 * Format a keymap shortcut for the current platform.
 * Input follows the ProseMirror keymap grammar, e.g. 'Mod-b', 'Mod-Shift-z', 'Alt-k'.
 * Mac: Mod→⌘  Shift→⇧  Alt→⌥, other keys uppercased, no separator.
 * Win: Mod→Ctrl  Shift→Shift  Alt→Alt, other keys uppercased, joined with '+'.
 */
export function kbd(shortcut: string): string {
    const parts = shortcut.split("-");
    if (_isMac) {
        return parts
            .map((p) => {
                if (p === "Mod") {
                    return "⌘";
                }
                if (p === "Shift") {
                    return "⇧";
                }
                if (p === "Alt") {
                    return "⌥";
                }
                return p.toUpperCase();
            })
            .join("");
    } else {
        return parts
            .map((p) => {
                if (p === "Mod") {
                    return "Ctrl";
                }
                if (p === "Shift") {
                    return "Shift";
                }
                if (p === "Alt") {
                    return "Alt";
                }
                return p.toUpperCase();
            })
            .join("+");
    }
}
