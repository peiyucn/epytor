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

const _uriToRel = new Map<string, string>();

export function setImageUriMap(map: Record<string, string>): void {
    _uriToRel.clear();
    for (const [uri, rel] of Object.entries(map)) {
        _uriToRel.set(uri, rel);
    }
}

export function remapImageUri(oldWebviewUri: string, newWebviewUri: string, newRelPath: string): void {
    _uriToRel.delete(oldWebviewUri);
    _uriToRel.set(newWebviewUri, newRelPath);
}

function toDisplayPath(src: string): string {
    return _uriToRel.get(src) ?? src;
}

type ViewMutationRecord = MutationRecord | { type: "selection"; target: Node };

const imageLightboxHost = createLightboxHost();

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

    onConfirm: (value: string, input: HTMLInputElement) => void;
    onCancel?: () => void;

    setupComplete?: (
        input: HTMLInputElement,
        confirm: () => void,
        cancel: () => void,
    ) => (() => void) | void;
}

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

    let detachActiveInlineEdit: (() => void) | null = null;

    const wrapper = document.createElement("div");
    wrapper.className = "image-wrapper";

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

    loadingPlaceholder.style.display = "flex";

    const captionEl = document.createElement("div");
    captionEl.className = "image-caption";
    captionEl.textContent = parseRatio((node.attrs["title"] as string) ?? "").clean;
    captionEl.addEventListener("mousedown", (e) => {

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

    const captionBtn = createButton({
        className: "img-tb-btn",
        tabIndex: -1,
        label: "CAP/ALT",
        title: t("Edit Caption"),
        tooltipPlacement: "above",
        onClick: () => startCaptionEdit(),
    });
    captionBtn.style.fontWeight = "600";

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

                    infoInput.value = orig;
                    showTooltipAt(
                        infoInput,

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

        infoInput.value = basenameNoExt(rawSrc);
    });

    infoInput.addEventListener("focus", () => {
        infoInput.select();
    });

    toolbar.appendChild(currentInfoEl);
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
    updateInfoElement(rawSrc);

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

                const datasetUri = (input.dataset.imgWebviewUri ?? "").trim();

                const applyUri = (newSrc: string) => {
                    if (!newSrc || newSrc === rawSrc) { view.focus(); return; }
                    const pos = getPos();
                    if (pos === undefined) { view.focus(); return; }
                    const nodeSize = currentNode.nodeSize;
                    const tr = view.state.tr.setNodeMarkup(pos, null, { ...currentNode.attrs, src: newSrc });
                    const afterPos = pos + nodeSize;
                    if (afterPos <= tr.doc.content.size) {
                        try { tr.setSelection(TextSelection.near(tr.doc.resolve(afterPos), 1)); } catch {}
                    }
                    view.dispatch(tr);
                    view.focus();
                };

                if (datasetUri) {
                    applyUri(datasetUri);
                } else if (displayVal) {

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

            return toolbar.contains(e.target as Node);
        },

        ignoreMutation(_m: ViewMutationRecord): boolean {

            return true;
        },

        destroy(): void {

            detachActiveInlineEdit?.();
            detachActiveInlineEdit = null;

            closeLightboxShowing(img.src);

            if (retryTimer !== null) {
                clearTimeout(retryTimer);
                retryTimer = null;
            }

            window.removeEventListener("pointermove", onResizeMove);
            window.removeEventListener("pointerup", onResizeUp);
            document.body.style.cursor = "";
        },
    };
}
