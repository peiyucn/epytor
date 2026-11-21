
import { Compartment, type Extension } from "@codemirror/state";
import { EditorView as CMEditorView } from "@codemirror/view";
import { oneDark } from "@codemirror/theme-one-dark";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { observeCmEditorCount } from "./cmThemeObserver";

export interface CmTheme {

    readonly compartment: Compartment;

    initialExtension(): Extension;

    reconfigureAll(): void;

    dispose(): void;
}

export function createCmTheme(container: HTMLElement, isDark: () => boolean): CmTheme {

    const extensions = { dark: oneDark, light: syntaxHighlighting(defaultHighlightStyle) };
    const compartment = new Compartment();
    const themeFor = (dark: boolean): Extension => (dark ? extensions.dark : extensions.light);

    const reconfigureAll = (): void => {
        document.querySelectorAll(".cm-editor").forEach((el) => {
            const view = CMEditorView.findFromDOM(el as HTMLElement);
            if (view) view.dispatch({ effects: compartment.reconfigure(themeFor(isDark())) });
        });
    };

    const disconnect = observeCmEditorCount(container, reconfigureAll);

    return {
        compartment,
        initialExtension: () => themeFor(isDark()),
        reconfigureAll,
        dispose: disconnect,
    };
}
