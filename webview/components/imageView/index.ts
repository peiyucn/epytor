import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import type {
    Decoration,
    DecorationSource,
    EditorView,
} from "@milkdown/kit/prose/view";
import {
    IconZoomIn,
    IconPencil,
    IconTrash2,
    IconCheck,
    IconX,
    IconImageOff,
} from "@/ui/icons";
import { t } from "@/i18n";
import { createButton, createSeparator, setupInputKeyboard } from "@/ui/dom";
import { showTooltipAt } from "@/ui/tooltip";
import { createLightboxHost, type Lightbox } from "@/ui/lightbox";
import { attachImgPathComplete, resolveToWebviewUri } from './imgPathComplete';
import './imageView.css';

const MAX_IMAGE_LOAD_RETRIES = 5;
const IMAGE_RETRY_BASE_DELAY_MS = 200;
const IMAGE_RETRY_MAX_DELAY_MS = 2000;
const MIN_IMAGE_RESIZE_HEIGHT = 40;
const MAX_IMAGE_RESIZE_RATIO = 0.8;

// webviewUri → relPath for display only. No reverse mirror: it went stale on rename, so
// reverse lookups go through the Extension's resolveImagePath (3s timeout fallback).
const _uriToRel = new Map<string, string>();

/** Written by index.ts after init/revert delivers the image URI map. */
export function setImageUriMap(map: Record<string, string>): void {
    _uriToRel.clear();
    for (const [uri, rel] of Object.entries(map)) {
        _uriToRel.set(uri, rel);
    }
}

/** Keep the display map in sync after a rename; init/revert alone would show the encoded URI. */
export function remapImageUri(oldWebviewUri: string, newWebviewUri: string, newRelPath: string): void {
    _uriToRel.delete(oldWebviewUri);
    _uriToRel.set(newWebviewUri, newRelPath);
}

/** Display path for a webviewUri; unknown URIs fall through unchanged. */
function toDisplayPath(src: string): string {
    return _uriToRel.get(src) ?? src;
}

type ViewMutationRecord = MutationRecord | { type: "selection"; target: Node };

/** Page-lifecycle singleton: one image lightbox at a time. */
const imageLightboxHost = createLightboxHost();

/**
 * Show an image full size. Returns the handle when it opened (callers that may outlive the
 * lightbox — the image NodeView — close only the lightbox they opened), or null when another
 * lightbox is already open.
 */
export function showGlobalLightbox(src: string, alt: string): Lightbox | null {
    return imageLightboxHost.open({
        className: "img-editor-lightbox",
        build: (root) => {
            const img = document.createElement("img");
            img.className = "img-editor-lightbox-img";
            img.src = src;
            img.alt = alt;

            const closeBtn = document.createElement("button");
            closeBtn.className = "img-editor-lightbox-close";
            closeBtn.innerHTML = IconX;
            closeBtn.title = t("Close");

            root.appendChild(img);
            root.appendChild(closeBtn);
            return { closeButton: closeBtn };
        },
    });
}

/**
 * Close the active lightbox when it shows `src`. NodeView.destroy keeps the historical
 * src-identity rule, so a lightbox opened from the editor container for this image still drops
 * its document keydown listener when the node disappears (undo / revert).
 */
function closeLightboxShowing(src: string): void {
    const lightbox = imageLightboxHost.active();
    if (!lightbox) {
        return;
    }
    const lbImg = lightbox.el.querySelector("img");
    if (lbImg && lbImg.src === src) {
        lightbox.close();
    }
}

// ProseMirror listens for copy/cut/paste on view.dom and preventDefaults them, so input
// clipboard events must not bubble. keydown is left alone: the webview needs it to reach
// window for native clipboard handling.
function isolateInput(input: HTMLInputElement): void {
    const stopOnly = (e: Event) => e.stopPropagation();
    input.addEventListener("copy", stopOnly);
    input.addEventListener("cut", stopOnly);
    input.addEventListener("paste", stopOnly);
    input.addEventListener("mousedown", stopOnly);
    input.addEventListener("click", stopOnly);
    input.addEventListener("select", stopOnly);
}

function basenameNoExt(src: string): string {
    const name = src.split("/").pop() ?? src;
    const dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name;
}

function makeBtn(icon: string, label: string): HTMLButtonElement {
    return createButton({ className: "img-tb-btn", icon, tabIndex: -1, title: label, tooltipPlacement: "above" });
}

function makeSep(): HTMLElement {
    return createSeparator("img-tb-sep", "span");
}

interface ToolbarInlineEditOptions {
    initialValue: string;
    placeholder: string;
    /** `input` is kept so callers can read dataset written by autocomplete. */
    onConfirm: (value: string, input: HTMLInputElement) => void;
    onCancel?: () => void;
    /** Optional autocomplete hook; returns a detach function. Default is setupInputKeyboard. */
    setupComplete?: (
        input: HTMLInputElement,
        confirm: () => void,
        cancel: () => void,
    ) => (() => void) | void;
}

/** Swap the toolbar for input + confirm/cancel, restoring it on confirm/cancel. */
/** Exported for tests: the inline-edit lifecycle (cleanup must be idempotent). */
export function startToolbarInlineEdit(
    toolbar: HTMLElement,
    options: ToolbarInlineEditOptions,
): () => void {
    const input = document.createElement("input");
    input.className = "img-rename-input";
    input.value = options.initialValue;
    input.placeholder = options.placeholder;
    isolateInput(input);

    function doConfirm(): void {
        const value = input.value.trim();
        options.onConfirm(value, input);
        cleanup();
    }

    function doCancel(): void {
        options.onCancel?.();
        cleanup();
    }

    const confirmBtn = createButton({
        className: "img-tb-btn",
        tabIndex: -1,
        icon: IconCheck,
        onClick: doConfirm,
    });
    confirmBtn.style.color = "var(--vscode-charts-green, #4caf50)";
    const cancelBtn = createButton({
        className: "img-tb-btn",
        tabIndex: -1,
        icon: IconX,
        onClick: doCancel,
    });

    Array.from(toolbar.children).forEach((el) => {
        (el as HTMLElement).style.display = "none";
    });
    toolbar.appendChild(input);
    toolbar.appendChild(confirmBtn);
    toolbar.appendChild(cancelBtn);

    input.focus();
    input.select();

    const detachComplete = options.setupComplete
        ? (options.setupComplete(input, doConfirm, doCancel) ?? undefined)
        : undefined;

    if (!options.setupComplete) {
        setupInputKeyboard(input, doConfirm, doCancel);
    }

    let cleaned = false;
    function cleanup(): void {
        if (cleaned) { return; }
        cleaned = true;
        detachComplete?.();
        if (toolbar.contains(input)) toolbar.removeChild(input);
        if (toolbar.contains(confirmBtn)) toolbar.removeChild(confirmBtn);
        if (toolbar.contains(cancelBtn)) toolbar.removeChild(cancelBtn);
        Array.from(toolbar.children).forEach((el) => {
            (el as HTMLElement).style.display = "";
        });
    }

    return cleanup;
}

export function createImageView(
    node: PMNode,
    view: EditorView,
    getPos: () => number | undefined,
    _decorations?: readonly Decoration[],
    _innerDecorations?: DecorationSource,
    onRenameImage?: (webviewUri: string, newBasename: string) => Promise<void>,
): {
    dom: HTMLElement;
    update: (n: PMNode) => boolean;
    selectNode: () => void;
    deselectNode: () => void;
    stopEvent: (e: Event) => boolean;
    ignoreMutation: (m: ViewMutationRecord) => boolean;
    destroy: () => void;
} {
    let currentNode = node;
    /** Detaches a still-open inline edit (path autocomplete) when the node dies mid-edit. */
    let detachActiveInlineEdit: (() => void) | null = null;

    const wrapper = document.createElement("div");
    wrapper.className = "image-wrapper";

    // Ratio is encoded at the end of `title` so the schema stays untouched.
    const RATIO_RE = /\s*ratio:([\d.]+)\s*$/;
    function parseRatio(title: string): { clean: string; ratio: number } {
        const m = title.match(RATIO_RE);
        return m ? { clean: title.replace(RATIO_RE, "").trim(), ratio: parseFloat(m[1]) || 1 } : { clean: title, ratio: 1 };
    }
    function encodeRatio(title: string, ratio: number): string {
        if (ratio === 1) return title;
        const { clean } = parseRatio(title);
        const r = `ratio:${ratio.toFixed(2)}`;
        return clean ? `${clean} ${r}` : r;
    }

    let currentRatio = parseRatio((node.attrs["title"] as string) ?? "").ratio;

    const img = document.createElement("img");
    img.className = "image-node";
    img.src = (node.attrs["src"] as string) ?? "";
    img.alt = (node.attrs["alt"] as string) ?? "";
    img.draggable = false;
    let imgNaturalH = 0;

    function applyRatio(): void {
        if (imgNaturalH <= 0) imgNaturalH = img.naturalHeight || 0;
        if (imgNaturalH <= 0) return;
        if (currentRatio === 1) { img.style.height = ""; return; }
        img.style.height = `${Math.round(imgNaturalH * currentRatio)}px`;
        img.style.width = "";
    }

    let imgErrored = false;
    const loadingPlaceholder = document.createElement("div");
    loadingPlaceholder.className = "img-loading-placeholder";
    loadingPlaceholder.innerHTML = '<span class="img-loading-spinner"></span><span>Loading...</span>';

    const errorPlaceholder = document.createElement("div");
    errorPlaceholder.className = "img-error-placeholder";
    errorPlaceholder.style.display = "none";

    let retryCount = 0;
    /** Retry timer; cleared in destroy so a detached img is never mutated again. */
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    img.addEventListener("error", () => {
        if (retryCount < MAX_IMAGE_LOAD_RETRIES) {
            retryCount++;
            const delay = Math.min(IMAGE_RETRY_BASE_DELAY_MS * retryCount, IMAGE_RETRY_MAX_DELAY_MS);
            retryTimer = setTimeout(() => {
                const src = img.src;
                img.src = "";
                img.src = src.replace(/([?&])_r=\d+/, "") + (src.includes("?") ? "&" : "?") + "_r=" + Date.now();
            }, delay);
            return;
        }
        imgErrored = true;
        img.style.display = "none";
        loadingPlaceholder.style.display = "none";
        errorPlaceholder.innerHTML = `${IconImageOff}<span>${t("Image not found")}</span>`;
        errorPlaceholder.style.display = "flex";
    });

    img.addEventListener("load", () => {
        imgNaturalH = img.naturalHeight;
        loadingPlaceholder.style.display = "none";
        if (imgErrored) {
            imgErrored = false;
            img.style.display = "";
            errorPlaceholder.style.display = "none";
        }
        applyRatio();
    });

    // Start in loading state; the browser's load/error event swaps it.
    loadingPlaceholder.style.display = "flex";

    const captionEl = document.createElement("div");
    captionEl.className = "image-caption";
    captionEl.textContent = parseRatio((node.attrs["title"] as string) ?? "").clean;
    captionEl.addEventListener("mousedown", (e) => {
        // Double-click to edit.
        if (e.detail === 2) { e.preventDefault(); startCaptionEdit(); }
    });

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "img-resize-handle";
    let resizeStartY = 0, resizeStartH = 0;

    resizeHandle.addEventListener("pointerdown", (e) => {
        e.preventDefault(); e.stopPropagation();
        resizeStartY = e.clientY;
        resizeStartH = img.getBoundingClientRect().height || imgNaturalH;
        document.body.style.cursor = "nwse-resize";
        window.addEventListener("pointermove", onResizeMove);
        window.addEventListener("pointerup", onResizeUp);
    });
    function onResizeMove(e: PointerEvent) {
        const h = Math.max(MIN_IMAGE_RESIZE_HEIGHT, Math.min(window.innerHeight * MAX_IMAGE_RESIZE_RATIO, resizeStartH + (e.clientY - resizeStartY)));
        img.style.height = `${h}px`;
    }
    function onResizeUp() {
        window.removeEventListener("pointermove", onResizeMove);
        window.removeEventListener("pointerup", onResizeUp);
        document.body.style.cursor = "";
        const h = parseFloat(img.style.height) || imgNaturalH;
        if (imgNaturalH <= 0 || h <= 0) return;
        currentRatio = parseFloat((h / imgNaturalH).toFixed(2));
        const pos = getPos();
        if (pos === undefined) return;
        const newTitle = encodeRatio((currentNode.attrs["title"] as string) ?? "", currentRatio);
        view.dispatch(view.state.tr.setNodeMarkup(pos, null, {
            ...currentNode.attrs,
            title: newTitle,
        }));
    }

    const toolbar = document.createElement("div");
    toolbar.className = "image-toolbar";
    toolbar.contentEditable = "false";

    const zoomBtn = makeBtn(IconZoomIn, t("View Full Size"));
    zoomBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showGlobalLightbox(img.src, img.alt);
    });

    // Caption lives in `title` next to the ratio suffix.
    const captionBtn = createButton({
        className: "img-tb-btn",
        tabIndex: -1,
        label: "CAP/ALT",
        title: t("Edit Caption"),
        tooltipPlacement: "above",
        onClick: () => startCaptionEdit(),
    });
    captionBtn.style.fontWeight = "600";

    // Always visible: edits the src attribute.
    const renameBtn = makeBtn(IconPencil, t("Edit Image Path"));
    renameBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        startSrcEdit();
    });

    const deleteBtn = makeBtn(IconTrash2, t("Delete"));
    deleteBtn.style.color = "var(--vscode-errorForeground, #f44)";
    deleteBtn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const pos = getPos();
        if (pos === undefined) {
            return;
        }
        view.dispatch(view.state.tr.delete(pos, pos + currentNode.nodeSize));
        view.focus();
    });

    // Read-only span for remote images, editable input for local filenames.
    const infoSpan = document.createElement("span");
    infoSpan.className = "img-tb-info";

    const infoInput = document.createElement("input");
    infoInput.type = "text";
    infoInput.className = "img-tb-info img-tb-info--input";
    isolateInput(infoInput);

    let currentInfoEl: HTMLElement = infoSpan;

    function updateInfo(src: string, _alt: string): void {
        const name = src.split("/").pop() ?? src;
        const caption = parseRatio((currentNode.attrs["title"] as string) ?? "").clean;
        const display = caption ? `${name} · ${caption}` : name;
        infoSpan.textContent = display;
        infoSpan.title = display;
        if (document.activeElement !== infoInput) {
            infoInput.value = basenameNoExt(src);
            infoInput.title = name;
        }
    }

    // Local webview URIs only (old and new forms).
    function isLocalImage(src: string): boolean {
        return /vscode-resource|vscode-cdn\.net/.test(src);
    }

    function updateInfoElement(src: string): void {
        const shouldUseInput = isLocalImage(src) && !!onRenameImage;
        const newEl = shouldUseInput ? infoInput : infoSpan;
        if (currentInfoEl !== newEl && currentInfoEl.parentElement) {
            currentInfoEl.parentElement.replaceChild(newEl, currentInfoEl);
            currentInfoEl = newEl;
        }
    }

    infoInput.addEventListener("keydown", (e) => {
        if (e.isComposing) {
            return;
        }
        if (e.key === "Enter") {
            e.stopPropagation();
            e.preventDefault();
            const newBasename = infoInput.value.trim();
            const orig = basenameNoExt(rawSrc);
            if (newBasename && newBasename !== orig && onRenameImage) {
                onRenameImage(rawSrc, newBasename).catch((error) => {
                    // Regression: a swallowed failure reset the input silently, so users assumed
                    // the rename had worked. Show the host's already-localized message.
                    infoInput.value = orig;
                    showTooltipAt(
                        infoInput,
                        // Fallback only for a message-less error.
                        error instanceof Error && error.message ? error.message : "Rename failed",
                        "above",
                    );
                });
            } else {
                infoInput.value = orig;
            }
            infoInput.blur();
            view.focus();
        } else if (e.key === "Escape") {
            e.stopPropagation();
            e.preventDefault();
            infoInput.value = basenameNoExt(rawSrc);
            infoInput.blur();
            view.focus();
        }
    });

    infoInput.addEventListener("blur", () => {
        // Uncommitted edit: restore the original name.
        infoInput.value = basenameNoExt(rawSrc);
    });

    infoInput.addEventListener("focus", () => {
        infoInput.select();
    });

    toolbar.appendChild(currentInfoEl); // infoSpan initially
    toolbar.appendChild(makeSep());
    toolbar.appendChild(zoomBtn);
    toolbar.appendChild(makeSep());
    toolbar.appendChild(captionBtn);
    toolbar.appendChild(makeSep());
    toolbar.appendChild(renameBtn);
    toolbar.appendChild(makeSep());
    toolbar.appendChild(deleteBtn);

    wrapper.appendChild(img);
    wrapper.appendChild(captionEl);
    wrapper.appendChild(resizeHandle);
    wrapper.appendChild(loadingPlaceholder);
    wrapper.appendChild(errorPlaceholder);
    wrapper.appendChild(toolbar);

    let rawSrc = (node.attrs["src"] as string) ?? "";
    updateInfo(rawSrc, img.alt);
    updateInfoElement(rawSrc); // may swap infoSpan for infoInput

    let isEditingCaption = false;

    function startCaptionEdit(): void {
        if (isEditingCaption) return;
        isEditingCaption = true;

        const caption = parseRatio((currentNode.attrs["title"] as string) ?? "").clean;
        detachActiveInlineEdit = startToolbarInlineEdit(toolbar, {
            initialValue: caption,
            placeholder: t("Caption"),
            onConfirm: (newCaption) => {
                isEditingCaption = false;
                const pos = getPos();
                if (pos === undefined) return;
                const newTitle = encodeRatio(newCaption, currentRatio);
                view.dispatch(view.state.tr.setNodeMarkup(pos, null, {
                    ...currentNode.attrs,
                    title: newCaption !== caption ? newTitle : currentNode.attrs.title,
                    alt: newCaption || "",
                }));
                img.alt = newCaption || "";
                captionEl.textContent = newCaption;
                view.focus();
            },
            onCancel: () => {
                isEditingCaption = false;
                view.focus();
            },
        });
    }

    let isEditingSrc = false;

    function startSrcEdit(): void {
        if (isEditingSrc) return;
        isEditingSrc = true;

        detachActiveInlineEdit = startToolbarInlineEdit(toolbar, {
            initialValue: toDisplayPath(rawSrc),
            placeholder: t("Image path or URL"),
            setupComplete: attachImgPathComplete,
            onConfirm: (displayVal, input) => {
                isEditingSrc = false;
                // Autocomplete's dataset URI is the most reliable source.
                const datasetUri = (input.dataset.imgWebviewUri ?? "").trim();

                const applyUri = (newSrc: string) => {
                    if (!newSrc || newSrc === rawSrc) { view.focus(); return; }
                    const pos = getPos();
                    if (pos === undefined) { view.focus(); return; }
                    const nodeSize = currentNode.nodeSize;
                    const tr = view.state.tr.setNodeMarkup(pos, null, { ...currentNode.attrs, src: newSrc });
                    const afterPos = pos + nodeSize;
                    if (afterPos <= tr.doc.content.size) {
                        try { tr.setSelection(TextSelection.near(tr.doc.resolve(afterPos), 1)); } catch { /* cursor restore may fail after setNodeMarkup */ }
                    }
                    view.dispatch(tr);
                    view.focus();
                };

                if (datasetUri) {
                    applyUri(datasetUri);
                } else if (displayVal) {
                    // Absolute URLs are used verbatim; everything else goes through the
                    // Extension (no stale reverse-mirror shortcut).
                    if (/^https?:\/\//i.test(displayVal)) {
                        applyUri(displayVal);
                    } else {
                        resolveToWebviewUri(displayVal).then(applyUri);
                    }
                }
            },
            onCancel: () => {
                isEditingSrc = false;
                view.focus();
            },
        });
    }

    return {
        dom: wrapper,

        update(updatedNode: PMNode): boolean {
            if (updatedNode.type !== currentNode.type) {
                return false;
            }
            const newSrc = (updatedNode.attrs["src"] as string) ?? "";
            const newAlt = (updatedNode.attrs["alt"] as string) ?? "";
            if (rawSrc !== newSrc) {
                rawSrc = newSrc;
                imgErrored = false;
                imgNaturalH = 0;
                loadingPlaceholder.style.display = "flex";
                errorPlaceholder.style.display = "none";
                img.src = newSrc;
                updateInfoElement(newSrc);
            }
            const newTitle = (updatedNode.attrs["title"] as string) ?? "";
            const { ratio: parsedRatio, clean: caption } = parseRatio(newTitle);
            captionEl.textContent = caption;
            if (currentRatio !== parsedRatio) {
                currentRatio = parsedRatio;
                if (imgNaturalH > 0) applyRatio();
            }
            if (img.alt !== newAlt) {
                img.alt = newAlt;
            }
            currentNode = updatedNode;
            updateInfo(rawSrc, newAlt);
            return true;
        },

        selectNode(): void {
            wrapper.classList.add("image-wrapper--selected");
            toolbar.style.display = "flex";
            resizeHandle.classList.add("img-resize-handle--visible");
        },

        deselectNode(): void {
            wrapper.classList.remove("image-wrapper--selected");
            toolbar.style.display = "none";
            resizeHandle.classList.remove("img-resize-handle--visible");
        },

        stopEvent(e: Event): boolean {
            // Toolbar events (buttons, input) are ours, not ProseMirror's.
            return toolbar.contains(e.target as Node);
        },

        ignoreMutation(_m: ViewMutationRecord): boolean {
            // No contentDOM: every DOM mutation is UI-only.
            return true;
        },

        destroy(): void {
            // A node destroyed while the path autocomplete is open must drop its document listener.
            detachActiveInlineEdit?.();
            detachActiveInlineEdit = null;
            // A node destroyed while its lightbox is open must drop the lightbox's keydown
            // listener too (revert / undo / external change).
            closeLightboxShowing(img.src);
            // A pending retry would rewrite a detached img.
            if (retryTimer !== null) {
                clearTimeout(retryTimer);
                retryTimer = null;
            }
            // A mid-drag delete would leave the resize listeners mutating the detached img.
            window.removeEventListener("pointermove", onResizeMove);
            window.removeEventListener("pointerup", onResizeUp);
            document.body.style.cursor = "";
        },
    };
}
