import "./imagePicker.css";
import { t } from "@/i18n";
import { attachImgPathComplete } from "../imageView/imgPathComplete";

type OnPick = (file: File) => Promise<unknown>;
type OnSelectProject = (relPath: string) => void;
type OnUrl = (url: string) => void;

let activePickerClose: (() => void) | null = null;

/** Close the picker overlay if it is open (rebuild path: the overlay lives on document.body). */
export function closeImagePicker(): void {
    activePickerClose?.();
}

export function showImagePicker(
    onPick: OnPick,
    onSelectProject: OnSelectProject,
    onUrl: OnUrl,
    getProjectImages: () => Promise<Array<{ relPath: string; webviewUri: string; name: string }> | null>,
): void {
    let activeTab: "upload" | "project" | "url" = "upload";

    const overlay = document.createElement("div");
    overlay.className = "epytor-img-picker-overlay";

    const dialog = document.createElement("div");
    dialog.className = "epytor-img-picker";

    const tabs = document.createElement("div");
    tabs.className = "epytor-img-picker-tabs";
    const makeTab = (label: string, key: typeof activeTab) => {
        const btn = document.createElement("button");
        btn.textContent = label;
        btn.className = `epytor-img-picker-tab${key === activeTab ? " active" : ""}`;
        btn.addEventListener("mousedown", (e) => {
            e.preventDefault();
            activeTab = key;
            tabs.querySelectorAll(".epytor-img-picker-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            panelUpload.style.display = key === "upload" ? "" : "none";
            panelProject.style.display = key === "project" ? "" : "none";
            panelUrl.style.display = key === "url" ? "" : "none";
            if (key === "project") loadProjectImages();
        });
        return btn;
    };
    const tabUpload = makeTab(t("Upload"), "upload");
    const tabProject = makeTab(t("Project Images"), "project");
    const tabUrl = makeTab(t("URL"), "url");
    tabs.appendChild(tabUpload);
    tabs.appendChild(tabProject);
    tabs.appendChild(tabUrl);

    const panelUpload = document.createElement("div");
    panelUpload.className = "epytor-img-picker-panel";
    const dropZone = document.createElement("div");
    dropZone.className = "epytor-img-picker-dropzone";
    dropZone.textContent = t("Click or drag image here");
    const fileInput = document.createElement("input");
    fileInput.type = "file"; fileInput.accept = "image/*";
    fileInput.style.display = "none";
    // Keep the input outside dropZone: dropZone.click() forwards to fileInput.click(), and a
    // nested input would bubble the synthetic click back → unbounded recursion (RangeError).
    panelUpload.appendChild(fileInput);
    panelUpload.appendChild(dropZone);
    const uploadStatus = document.createElement("div");
    uploadStatus.className = "epytor-img-picker-status";
    uploadStatus.style.display = "none";
    panelUpload.appendChild(uploadStatus);

    const panelUrl = document.createElement("div");
    panelUrl.className = "epytor-img-picker-panel";
    panelUrl.style.display = "none";
    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.className = "epytor-img-picker-url-input";
    urlInput.placeholder = t("Image URL https://...");
    const urlInsertBtn = document.createElement("button");
    urlInsertBtn.className = "epytor-img-picker-url-btn";
    urlInsertBtn.textContent = t("Insert");
    urlInsertBtn.addEventListener("click", () => {
        const v = urlInput.value.trim();
        if (v) { onUrl(v); close(); }
    });
    urlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") urlInsertBtn.click(); });
    panelUrl.appendChild(urlInput);
    panelUrl.appendChild(urlInsertBtn);
    // Keep the detach handle and drop it on close: a leaked document mousedown listener let the
    // debounced suggestion re-open a stray dropdown after the dialog was gone.
    const detachComplete = attachImgPathComplete(urlInput);

    const panelProject = document.createElement("div");
    panelProject.className = "epytor-img-picker-panel";
    panelProject.style.display = "none";
    const grid = document.createElement("div");
    grid.className = "epytor-img-picker-grid";
    const gridStatus = document.createElement("div");
    gridStatus.className = "epytor-img-picker-status";
    gridStatus.textContent = t("Loading...");
    panelProject.appendChild(gridStatus);
    panelProject.appendChild(grid);

    dialog.appendChild(tabs);
    dialog.appendChild(panelUpload);
    dialog.appendChild(panelUrl);
    dialog.appendChild(panelProject);
    overlay.appendChild(dialog);

    // Detach autocomplete listeners before removing the overlay.
    const close = () => {
        if (activePickerClose === close) { activePickerClose = null; }
        detachComplete();
        overlay.remove();
    };
    activePickerClose = close;
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) close(); });

    // Keep the dialog open until the upload succeeds; on failure show the error and allow a
    // retry (regression: closing immediately + a host-side empty catch made failures silent).
    async function submitFile(file: File): Promise<void> {
        dropZone.style.pointerEvents = "none";
        uploadStatus.style.display = "";
        uploadStatus.textContent = t("Uploading...");
        try {
            await onPick(file);
            close();
        } catch {
            dropZone.style.pointerEvents = "";
            uploadStatus.textContent = t("Upload failed");
        }
    }

    dropZone.addEventListener("click", () => fileInput.click());
    dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
    dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drag-over");
        const f = e.dataTransfer?.files?.[0];
        if (f?.type.startsWith("image/")) { void submitFile(f); }
    });
    fileInput.addEventListener("change", () => {
        const f = fileInput.files?.[0];
        fileInput.value = ""; // Allow re-picking the same file on retry.
        if (f) { void submitFile(f); }
    });

    let imagesLoaded = false;
    function loadProjectImages(): void {
        if (imagesLoaded) return;
        imagesLoaded = true;
        gridStatus.style.display = "";
        getProjectImages()
            .then((images) => {
                gridStatus.style.display = "none";
                renderGrid(images ?? []);
            })
            .catch(() => {
                gridStatus.textContent = t("Failed to load images");
            });
    }

    function renderGrid(images: Array<{ relPath: string; webviewUri: string; name: string }>): void {
        grid.innerHTML = "";
        if (images.length === 0) {
            gridStatus.textContent = t("No images found");
            return;
        }
        for (const img of images) {
            const item = document.createElement("div");
            item.className = "epytor-img-picker-item";
            const thumb = document.createElement("img");
            thumb.src = img.webviewUri;
            thumb.loading = "lazy";
            const nameEl = document.createElement("span");
            nameEl.className = "epytor-img-picker-item-name";
            nameEl.textContent = img.name;
            item.appendChild(thumb);
            item.appendChild(nameEl);
            item.addEventListener("click", () => { onSelectProject(img.webviewUri); close(); });
            grid.appendChild(item);
        }
    }

    document.body.appendChild(overlay);
}
