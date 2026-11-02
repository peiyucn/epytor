/**
 * CodeMirror theme wiring for code blocks.
 *
 * Crepe's codeMirror feature evaluates `theme.of(...)` only when the feature is registered, so
 * blocks created after a theme switch would keep the old theme; `cmThemeObserver` watches the
 * `.cm-editor` count and this module reconfigures every instance through one compartment.
 *
 * Extracted from `createEditor` (audit F2): extension caching matters (a fresh object would
 * make `Compartment.reconfigure` re-render every editor), so it has a single owner here.
 */
import { Compartment, type Extension } from "@codemirror/state";
import { EditorView as CMEditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { observeCmEditorCount } from "./cmThemeObserver";

export interface CmTheme {
    /** Compartment to seed the codeMirror feature with (`.theme(compartment.of(...))`). */
    readonly compartment: Compartment;
    /** Theme extension for the current theme. */
    initialExtension(): Extension;
    /** Theme changed: reconfigure every mounted CodeMirror instance. */
    reconfigureAll(): void;
    /** Stop the count observer (editor rebuild). */
    dispose(): void;
}

export function createCmTheme(container: HTMLElement, isDark: () => boolean): CmTheme {
    // Cache the extensions: a fresh object makes Compartment.reconfigure re-render every CM.
    const extensions = { dark: oneDark, light: syntaxHighlighting(defaultHighlightStyle) };
    const compartment = new Compartment();
    const themeFor = (dark: boolean): Extension => (dark ? extensions.dark : extensions.light);

    const reconfigureAll = (): void => {
        document.querySelectorAll(".cm-editor").forEach((el) => {
            const view = CMEditorView.findFromDOM(el as HTMLElement);
            if (view) view.dispatch({ effects: compartment.reconfigure(themeFor(isDark())) });
        });
    };

    // Count-change only; observing every DOM mutation looped (see editor/cmThemeObserver.ts).
    const disconnect = observeCmEditorCount(container, reconfigureAll);

    return {
        compartment,
        initialExtension: () => themeFor(isDark()),
        reconfigureAll,
        dispose: disconnect,
    };
}
