/**
 * `shared/messages.ts`
 * Single source of truth for the WebView <-> Extension message types; both sides
 * import from here and must not redeclare them inline.
 */
import type { TableWrapMode } from "./tableWrap";

/** Image metadata: project-relative path, WebView-accessible URI, and file name. */
export type ProjectImage = {
    relPath: string;
    webviewUri: string;
    name: string;
};

/** One path-completion suggestion. */
export type PathSuggestionItem = {
    path: string;
    isDir: boolean;
    webviewUri?: string;  // image files only, for the thumbnail preview
};

/**
 * WebView -> Extension messages. Fields optionality reflects the sender's real
 * constraints: anything the sender must provide stays required.
 */
export type ToExtensionMessage =
    | { type: "ready" }
    | { type: "markDirty" }
    /** Unsaved content pushed by the webview (400ms idle / blur / pagehide); used to restore after rebuild and as a save fallback. */
    | { type: "unsavedContent"; content: string }
    | { type: "contentResponse"; content: string }
    | { type: "frontmatterUpdate"; frontmatter: string }
    | { type: "openUrl"; url: string }
    | { type: "openFile"; path: string }
    | { type: "switchToTextEditor"; line?: number }
    | { type: "viewportLine"; line: number }
    | { type: "openSettings" }
    | { type: "uploadImage"; id: string; data: Uint8Array; mimeType: string; altText: string }
    | { type: "getProjectImages"; id: string }
    | { type: "renameImage"; id: string; webviewUri: string; newBasename: string }
    | { type: "getPathSuggestions"; id: string; query: string }
    | { type: "resolveImagePath"; id: string; relPath: string }
    | { type: "wordCount"; lines: number; words: number; charsNoSpace: number; charsWithSpace: number };

/**
 * Extension -> WebView messages. `lineMap` is optional on init/revert: the Extension
 * always sends it, but the webview falls back to `[]` defensively.
 */
export type ToWebviewMessage =
    | { type: "init"; content: string; active?: boolean; serializationMode?: "clean" | "compatible"; lineMap?: number[]; lineEndMap?: number[]; scrollToLine?: number; frontmatter?: string; imageUriMap?: Record<string, string> }
    | { type: "revert"; content: string; lineMap?: number[]; lineEndMap?: number[]; frontmatter?: string; imageUriMap?: Record<string, string> }
    | { type: "panelActiveState"; active: boolean }
    | { type: "requestContent" }
    | { type: "scrollToLine"; line: number }
    | { type: "lineMapUpdate"; lineMap: number[]; lineEndMap?: number[] }
    | { type: "setSerializationMode"; mode: "clean" | "compatible" }
    | { type: "tableWrapModeChanged"; mode: TableWrapMode }
    /** Editor content max width (px, already clamped by the schema bounds). */
    | { type: "editorMaxWidthChanged"; value: number }
    /** Code block max height (px, already clamped by the schema bounds). */
    | { type: "codeBlockMaxHeightChanged"; value: number }
    /** One-shot notice in the webview (text localized by the Extension). */
    | { type: "notice"; message: string }
    | { type: "imageUploaded"; id: string; url: string }
    | { type: "imageUploadError"; id: string; error: string }
    | { type: "projectImagesList"; id: string; images: ProjectImage[] }
    | { type: "imageRenamed"; id: string; oldWebviewUri: string; newWebviewUri: string; newRelPath: string }
    | { type: "imageRenameError"; id: string; error: string }
    | { type: "requestSwitchToTextEditor" }
    | { type: "pathSuggestions"; id: string; items: PathSuggestionItem[] }
    | { type: "imagePathResolved"; id: string; webviewUri: string };
