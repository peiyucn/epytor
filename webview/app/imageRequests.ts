/**
 * Image request orchestration and image insertion wiring.
 *
 * Upload / project-gallery / rename requests are correlated by per-kind registries; the
 * rename reply also rewrites image nodes in the open document, so the module takes an
 * editor accessor instead of importing editor.ts (which would be a cycle via index).
 * Extracted from index.ts (audit F1) so the registries and the remap logic have one owner.
 */
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import type { ProjectImage, ToWebviewMessage } from "../../shared/messages";
import {
    notifyGetProjectImages,
    notifyRenameImage,
    notifyUploadImage,
} from "../messaging";
import { showImagePicker } from "../components/imagePicker";
import { remapImageUri } from "../components/imageView";
import { PendingRequestRegistry } from "./pendingRequest";

const RENAME_IMAGE_TIMEOUT_MS = 15000;
const UPLOAD_IMAGE_TIMEOUT_MS = 30000;
const GET_PROJECT_IMAGES_TIMEOUT_MS = 10000;

/** The editor instance is owned by the entry; this module only reads it when inserting. */
export interface ImageRequestDeps {
    getEditor(): Editor | null;
}

export interface ImageRequestController {
    /** Inline path edit renamed a file; resolves when the extension confirms, rejects on error/timeout. */
    renameImage(webviewUri: string, newBasename: string): Promise<void>;
    /** Read the file, send it for upload, resolve with the resulting src (rejects on error/timeout). */
    uploadImageFile(file: File, altText: string): Promise<string>;
    /** Insert an image node at the current selection and refocus the editor. */
    insertImageNode(src: string, alt: string): void;
    /** Ask the extension for the project gallery; resolves null when it does not answer in time. */
    requestProjectImages(): Promise<ProjectImage[] | null>;
    /** Route an extension reply here; false means "not an image message" (caller keeps routing). */
    handleMessage(msg: ToWebviewMessage): boolean;
}

export function createImageRequestController(deps: ImageRequestDeps): ImageRequestController {
    const uploadRequests = new PendingRequestRegistry<string>("img");
    const getImagesRequests = new PendingRequestRegistry<ProjectImage[] | null>("gimgs");
    const renameRequests = new PendingRequestRegistry<void>("rename");

    function insertImageNode(src: string, alt: string): void {
        const editor = deps.getEditor();
        if (!editor) {
            return;
        }
        editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { state } = view;
            const imageType = state.schema.nodes["image"];
            if (!imageType) {
                return;
            }
            const node = imageType.create({ src, alt, title: "" });
            view.dispatch(state.tr.replaceSelectionWith(node));
            view.focus();
        });
    }

    async function renameImage(webviewUri: string, newBasename: string): Promise<void> {
        const { id, promise } = renameRequests.begin({
            timeoutMs: RENAME_IMAGE_TIMEOUT_MS,
            timeout: { kind: "reject", error: "Rename timed out" },
        });
        notifyRenameImage(id, webviewUri, newBasename);
        return promise;
    }

    async function uploadImageFile(file: File, altText: string): Promise<string> {
        const { id, promise, cancel } = uploadRequests.begin({
            timeoutMs: UPLOAD_IMAGE_TIMEOUT_MS,
            timeout: { kind: "reject", error: "Upload timed out" },
        });
        const reader = new FileReader();
        reader.onload = () => {
            const data = new Uint8Array(reader.result as ArrayBuffer);
            notifyUploadImage(id, data, file.type, altText);
        };
        reader.onerror = () => cancel("Failed to read file");
        reader.readAsArrayBuffer(file);
        return promise;
    }

    function requestProjectImages(): Promise<ProjectImage[] | null> {
        const { id, promise } = getImagesRequests.begin({
            timeoutMs: GET_PROJECT_IMAGES_TIMEOUT_MS,
            // Regression: without a resolve(null) fallback the picker hung on "Loading".
            timeout: { kind: "resolve", value: null },
        });
        notifyGetProjectImages(id);
        return promise;
    }

    /** The map must be remapped and the open nodes rewritten here: index.ts no longer owns it. */
    function handleImageRenamed(
        msg: Extract<ToWebviewMessage, { type: "imageRenamed" }>,
    ): void {
        renameRequests.resolve(msg.id);
        // Regression: the map refreshed only on init, so path edits showed encoded URI tails.
        remapImageUri(msg.oldWebviewUri, msg.newWebviewUri, msg.newRelPath);
        const editor = deps.getEditor();
        if (!editor) { return; }
        editor.action((ctx) => {
            const view = ctx.get(editorViewCtx);
            const { state } = view;
            const tr = state.tr;
            let changed = false;
            state.doc.descendants((node, pos) => {
                if (
                    node.type.name === "image" &&
                    node.attrs["src"] === msg.oldWebviewUri
                ) {
                    tr.setNodeMarkup(pos, null, {
                        ...node.attrs,
                        src: msg.newWebviewUri,
                    });
                    changed = true;
                }
            });
            if (changed) {
                view.dispatch(tr);
            }
        });
    }

    function handleMessage(msg: ToWebviewMessage): boolean {
        switch (msg.type) {
            case "imageUploaded":
                uploadRequests.resolve(msg.id, msg.url);
                return true;
            case "imageUploadError":
                uploadRequests.reject(msg.id, msg.error);
                return true;
            case "projectImagesList":
                getImagesRequests.resolve(msg.id, msg.images);
                return true;
            case "imageRenamed":
                handleImageRenamed(msg);
                return true;
            case "imageRenameError":
                renameRequests.reject(msg.id, msg.error);
                return true;
            default:
                return false;
        }
    }

    return {
        renameImage,
        uploadImageFile,
        insertImageNode,
        requestProjectImages,
        handleMessage,
    };
}

/** Wire the toolbar image picker custom event (`epytor:insertImage`). */
export function initImagePickerInsertion(controller: ImageRequestController): void {
    document.addEventListener("epytor:insertImage", () => {
        showImagePicker(
            (file) => {
                // Regression: an empty catch swallowed upload failures; let the picker show them.
                return controller.uploadImageFile(file, "").then((url) => controller.insertImageNode(url, ""));
            },
            (relPath) => {
                controller.insertImageNode(relPath, "");
            },
            (url) => {
                controller.insertImageNode(url, "");
            },
            () => controller.requestProjectImages(),
        );
    });
}

/** Drag/drop and paste insertion of local image files. */
export function initImageDropPaste(
    container: HTMLElement,
    controller: ImageRequestController,
): void {
    container.addEventListener("dragover", (e) => {
        const items = e.dataTransfer?.items;
        if (
            items &&
            Array.from(items).some(
                (i) => i.kind === "file" && i.type.startsWith("image/"),
            )
        ) {
            e.preventDefault();
            e.stopPropagation();
        }
    });

    container.addEventListener("drop", (e) => {
        const files = e.dataTransfer?.files;
        if (!files?.length) {
            return;
        }
        const imageFile = Array.from(files).find((f) =>
            f.type.startsWith("image/"),
        );
        if (!imageFile) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        controller.uploadImageFile(imageFile, "")
            .then((url) => {
                controller.insertImageNode(url, "");
            })
            .catch((err: Error) =>
                console.error("[ImageUpload] drop failed:", err),
            );
    });

    document.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items;
        if (!items) {
            return;
        }
        const imageItem = Array.from(items).find((i) =>
            i.type.startsWith("image/"),
        );
        if (!imageItem) {
            return;
        }
        const file = imageItem.getAsFile();
        if (!file) {
            return;
        }
        e.preventDefault();
        controller.uploadImageFile(file, "")
            .then((url) => {
                controller.insertImageNode(url, "");
            })
            .catch((err: Error) =>
                console.error("[ImageUpload] paste failed:", err),
            );
    });
}
