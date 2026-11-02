/**
 * Editor instance + saved baseline (audit F2/F10).
 *
 * The singleton editor and the "markdown + doc at the last save" snapshot used to be four
 * independent module-level `let`s in editor.ts; the pair is now one object so both halves
 * cannot drift apart. `getMarkdownForSave()` is the only serialization entry point: the
 * extension pulls content on save, typing never serializes.
 */
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { getMarkdown } from "@milkdown/kit/utils";
import type { SerializationMode } from "../markdown/markdownSerializer";
import { prepareMarkdownForSave } from "./serialization";

/**
 * Save baselines kept together:
 * - `markdown`: text of the last save; also what a save returns while no editor exists (F3).
 * - `doc`: the document that text was produced from; null = cannot prove untouched, re-serialize.
 */
export class SavedSnapshot {
    private _markdown = "";
    private _doc: ProseNode | null = null;

    get markdown(): string {
        return this._markdown;
    }

    get doc(): ProseNode | null {
        return this._doc;
    }

    /** Adopt disk content as the baseline before a rebuild; the doc half belongs to the dead editor. */
    adoptDiskContent(content: string): void {
        this._markdown = content;
    }

    /** A freshly built editor was seeded with this markdown (createEditor config-time seed). */
    seedMarkdown(markdown: string): void {
        this._markdown = markdown;
    }

    /** The new editor's doc equals the seeded text once it has settled. */
    seedDoc(doc: ProseNode): void {
        this._doc = doc;
    }

    /** The snapshot only matches the current serialization mode; a mode switch invalidates it. */
    invalidateDoc(): void {
        this._doc = null;
    }

    /** True when `doc` is exactly the doc the baseline text came from (an untouched save). */
    matches(doc: ProseNode): boolean {
        return this._doc !== null && doc.eq(this._doc);
    }

    /** Record a save: both halves always move together. */
    recordSave(markdown: string, doc: ProseNode): void {
        this._markdown = markdown;
        this._doc = doc;
    }
}

export interface EditorSession {
    readonly snapshot: SavedSnapshot;
    getEditor(): Editor | null;
    setEditor(editor: Editor | null): void;
    getView(): EditorView | null;
    /** Serialize once for the host; returns the saved text verbatim when the doc is untouched. */
    getMarkdownForSave(): string;
    getSerializationMode(): SerializationMode;
    setSerializationMode(mode: SerializationMode): void;
    adoptDiskContentAsBaseline(content: string): void;
    /** Theme-bus unsubscribe handle; owned here so destroy() releases it in the original order. */
    setThemeUnsubscribe(unsubscribe: (() => void) | null): void;
    /** CodeMirror count-observer disconnect handle (disconnects the previous one first). */
    setCmObserverDisconnect(disconnect: (() => void) | null): void;
    /** Destroy the editor and its side effects; idempotent. */
    destroy(): void;
}

export function createEditorSession(): EditorSession {
    const snapshot = new SavedSnapshot();
    let editor: Editor | null = null;
    let serializationMode: SerializationMode = "clean";
    // Regression: leaked theme listeners pinned whole old documents; release both handles here.
    let unsubscribeTheme: (() => void) | null = null;
    let disconnectCmObserver: (() => void) | null = null;

    function getView(): EditorView | null {
        if (!editor) return null;
        return editor.action((ctx) => ctx.get(editorViewCtx));
    }

    function getMarkdownForSave(): string {
        if (!editor) return snapshot.markdown;
        const view = editor.action((ctx) => ctx.get(editorViewCtx));
        // Untouched save returns the saved text via doc equality. Regression: the 7.22.2
        // serializer changed trailing blank lines, turning loose lists tight on an unchanged save.
        if (snapshot.matches(view.state.doc)) { return snapshot.markdown; }
        const serialized = editor.action(getMarkdown());
        const toSave = prepareMarkdownForSave({
            source: snapshot.markdown,
            serialized,
            mode: serializationMode,
        });
        snapshot.recordSave(toSave, view.state.doc);
        return toSave;
    }

    function destroy(): void {
        unsubscribeTheme?.();
        unsubscribeTheme = null;
        disconnectCmObserver?.();
        disconnectCmObserver = null;
        editor?.destroy();
        editor = null;
        snapshot.invalidateDoc();
    }

    return {
        snapshot,
        getEditor: () => editor,
        setEditor: (next) => { editor = next; },
        getView,
        getMarkdownForSave,
        getSerializationMode: () => serializationMode,
        setSerializationMode: (mode) => {
            // The snapshot is only valid for the current serialization mode.
            if (mode !== serializationMode) { snapshot.invalidateDoc(); }
            serializationMode = mode;
        },
        adoptDiskContentAsBaseline: (content) => {
            snapshot.adoptDiskContent(content);
        },
        setThemeUnsubscribe: (unsubscribe) => {
            unsubscribeTheme = unsubscribe;
        },
        setCmObserverDisconnect: (disconnect) => {
            disconnectCmObserver?.();
            disconnectCmObserver = disconnect;
        },
        destroy,
    };
}
