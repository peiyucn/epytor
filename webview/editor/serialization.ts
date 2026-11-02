/**
 * Save-time markdown normalization, as a pure function so it can be tested without an editor.
 *
 * The serializer always emits LF; comparing on LF and restoring the source EOL keeps a CRLF
 * file from being rewritten on every save. "clean" mode also restores the file's table-break
 * spelling and applies the minimal diff, "compatible" mode keeps the serializer output as-is.
 */
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
    /** Previous on-disk text (the baseline the minimal diff compares against). */
    source: string;
    /** Raw serializer output for the current document. */
    serialized: string;
    mode: SerializationMode;
}

/** Normalize a save: `<br />` placeholders, `\&` escapes, minimal diff, source EOL. */
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
            // Keep the log: a silent fallback to compatible output would hide serializer defects.
            console.warn("[markdown-serialization] Clean serializer failed; using compatible output", { error });
            return applyMinimalChanges(sourceLf, normalized);
        }
    })();
    return withLineEnding(withoutEol, eol);
}
