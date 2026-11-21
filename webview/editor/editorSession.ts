
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { getMarkdown } from "@milkdown/kit/utils";
import type { SerializationMode } from "../markdown/markdownSerializer";
import { prepareMarkdownForSave } from "./serialization";

export class SavedSnapshot {
    private _markdown = "";
    private _doc: ProseNode | null = null;

    get markdown(): string {
        return this._markdown;
    }

    get doc(): ProseNode | null {
        return this._doc;
    }

    adoptDiskContent(content: string): void {
        this._markdown = content;
    }

    seedMarkdown(markdown: string): void {
        this._markdown = markdown;
    }

    seedDoc(doc: ProseNode): void {
        this._doc = doc;
    }

    invalidateDoc(): void {
        this._doc = null;
    }

    matches(doc: ProseNode): boolean {
        return this._doc !== null && doc.eq(this._doc);
    }

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

    getMarkdownForSave(): string;
    getSerializationMode(): SerializationMode;
    setSerializationMode(mode: SerializationMode): void;
    adoptDiskContentAsBaseline(content: string): void;

    setThemeUnsubscribe(unsubscribe: (() => void) | null): void;

    setCmObserverDisconnect(disconnect: (() => void) | null): void;

    destroy(): void;
}

export function createEditorSession(): EditorSession {
    const snapshot = new SavedSnapshot();
    let editor: Editor | null = null;
    let serializationMode: SerializationMode = "clean";

    let unsubscribeTheme: (() => void) | null = null;
    let disconnectCmObserver: (() => void) | null = null;

    function getView(): EditorView | null {
        if (!editor) return null;
        return editor.action((ctx) => ctx.get(editorViewCtx));
    }

    function getMarkdownForSave(): string {
        if (!editor) return snapshot.markdown;
        const view = editor.action((ctx) => ctx.get(editorViewCtx));

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
