
import type { TableWrapMode } from "./tableWrap";


export type ProjectImage = {
    relPath: string;
    webviewUri: string;
    name: string;
};


export type PathSuggestionItem = {
    path: string;
    isDir: boolean;
    webviewUri?: string;
};


export type ToExtensionMessage =
    | { type: "ready" }
    | { type: "markDirty" }

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


export type ToWebviewMessage =
    | { type: "init"; content: string; active?: boolean; serializationMode?: "clean" | "compatible"; lineMap?: number[]; lineEndMap?: number[]; scrollToLine?: number; frontmatter?: string; imageUriMap?: Record<string, string> }
    | { type: "revert"; content: string; lineMap?: number[]; lineEndMap?: number[]; frontmatter?: string; imageUriMap?: Record<string, string> }
    | { type: "panelActiveState"; active: boolean }
    | { type: "requestContent" }
    | { type: "scrollToLine"; line: number }
    | { type: "lineMapUpdate"; lineMap: number[]; lineEndMap?: number[] }
    | { type: "setSerializationMode"; mode: "clean" | "compatible" }
    | { type: "tableWrapModeChanged"; mode: TableWrapMode }

    | { type: "editorMaxWidthChanged"; value: number }

    | { type: "codeBlockMaxHeightChanged"; value: number }

    | { type: "notice"; message: string }
    | { type: "imageUploaded"; id: string; url: string }
    | { type: "imageUploadError"; id: string; error: string }
    | { type: "projectImagesList"; id: string; images: ProjectImage[] }
    | { type: "imageRenamed"; id: string; oldWebviewUri: string; newWebviewUri: string; newRelPath: string }
    | { type: "imageRenameError"; id: string; error: string }
    | { type: "requestSwitchToTextEditor" }
    | { type: "pathSuggestions"; id: string; items: PathSuggestionItem[] }
    | { type: "imagePathResolved"; id: string; webviewUri: string };
