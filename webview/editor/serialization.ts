
import {
    detectLineEnding,
    dropRedundantAmpersandEscapes,
    preserveTableBreakStyle,
    stripListItemBreakPlaceholder,
    toLf,
    withLineEnding,
    type SerializationMode,
} from "../markdown/markdownSerializer";
import { applyMinimalChanges } from "../markdown/minimalDiff";

export interface PrepareMarkdownOptions {

    source: string;

    serialized: string;
    mode: SerializationMode;
}

export function prepareMarkdownForSave(options: PrepareMarkdownOptions): string {
    const { source, serialized, mode } = options;
    const eol = detectLineEnding(source);
    const sourceLf = toLf(source);
    const normalized = dropRedundantAmpersandEscapes(stripListItemBreakPlaceholder(toLf(serialized)));
    const withoutEol = (() => {
        if (mode === "compatible") return applyMinimalChanges(sourceLf, normalized);
        try {
            return applyMinimalChanges(sourceLf, preserveTableBreakStyle(sourceLf, normalized));
        } catch (error) {

            console.warn("[markdown-serialization] Clean serializer failed; using compatible output", { error });
            return applyMinimalChanges(sourceLf, normalized);
        }
    })();
    return withLineEnding(withoutEol, eol);
}
