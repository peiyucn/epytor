/**
 * Editable frontmatter panel: one row per kv entry plus add/delete, debounced onChange with the
 * serialized YAML header. The host disposes the old instance on rebuild so a stale timer cannot
 * write back old values.
 */
import "./frontmatterPanel.css";
import { parseFrontmatter, serializeFrontmatter, type FrontmatterEntry, type FrontmatterRow } from "@/markdown/frontmatter";
import { t } from "@/i18n";

export interface FrontmatterPanelHandle {
    panel: HTMLElement;
    /** The panel was removed from the document (null handle when there is no frontmatter). */
    dispose(): void;
}

const SAVE_DEBOUNCE_MS = 300;

export function createFrontmatterPanel(
    frontmatter: string,
    onChange: (serialized: string) => void,
): FrontmatterPanelHandle | null {
    const parsed = parseFrontmatter(frontmatter);
    if (!parsed.some((entry) => entry.type === "kv")) return null;

    /**
     * Source of truth. `null` marks a deleted kv row (index order must survive so `dataset.fmIndex`
     * keeps pointing at the right entry); raw rows are not rendered and are re-emitted in place.
     */
    const entries: (FrontmatterEntry | null)[] = [...parsed];

    const panel = document.createElement("div");
    panel.id = "frontmatter-panel";
    panel.className = "frontmatter-panel";
    const table = document.createElement("table");
    table.className = "frontmatter-table";
    const tbody = document.createElement("tbody");
    table.appendChild(tbody);
    panel.appendChild(table);

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    const clearTimer = () => {
        if (saveTimer !== null) {
            clearTimeout(saveTimer);
            saveTimer = null;
        }
    };

    /** Read kv rows in DOM order back into the entries (raw rows keep their positions). */
    const collectRows = (): FrontmatterRow[] => {
        const rows: FrontmatterRow[] = [];
        tbody.querySelectorAll<HTMLTableRowElement>("tr.fm-row").forEach((tr) => {
            const keyInput = tr.querySelector<HTMLInputElement>(".fm-key-input");
            const valueInput = tr.querySelector<HTMLInputElement>(".fm-val-input");
            const key = keyInput?.value ?? "";
            const value = valueInput?.value ?? "";
            rows.push({ key, value });
            const index = Number(tr.dataset.fmIndex ?? -1);
            if (index >= 0) {
                entries[index] = { type: "kv", key, value };
            }
        });
        return rows;
    };

    const serializeEntries = (): string => {
        const valid = entries.filter((entry): entry is FrontmatterEntry => entry !== null);
        return serializeFrontmatter(valid);
    };

    /**
     * Validate and mark bad rows: a value without a key is dropped on write (users read that as
     * "adding a row did nothing"). Returns false while a row still needs a key; that key input
     * gets the error style and focus.
     */
    const validateRows = (rows: FrontmatterRow[]): boolean => {
        let valid = true;
        const rowEls = tbody.querySelectorAll<HTMLTableRowElement>("tr.fm-row");
        rows.forEach((row, index) => {
            const keyInput = rowEls[index]?.querySelector<HTMLInputElement>(".fm-key-input");
            const emptyKeyWithValue = row.key.trim() === "" && row.value.trim() !== "";
            keyInput?.classList.toggle("fm-key-input--error", emptyKeyWithValue);
            if (emptyKeyWithValue) {
                valid = false;
                if (document.activeElement !== keyInput) {
                    keyInput?.focus();
                }
            }
        });
        return valid;
    };

    const scheduleSave = () => {
        if (disposed) return;
        clearTimer();
        saveTimer = setTimeout(() => {
            saveTimer = null;
            if (disposed) return;
            const rows = collectRows();
            if (!validateRows(rows)) return;
            onChange(serializeEntries());
        }, SAVE_DEBOUNCE_MS);
    };

    /** Commit now (blur / delete / mode switch) so nothing is lost inside the debounce window. */
    const flushSave = () => {
        if (disposed) return;
        clearTimer();
        const rows = collectRows();
        if (!validateRows(rows)) return;
        onChange(serializeEntries());
    };

    const addRow = (key = "", value = "", entryIndex = -1): void => {
        const tr = document.createElement("tr");
        tr.className = "fm-row";
        tr.dataset.fmIndex = String(entryIndex);
        const keyTd = document.createElement("td");
        keyTd.className = "fm-key";
        const keyInput = document.createElement("input");
        keyInput.className = "fm-key-input";
        keyInput.value = key;
        keyInput.placeholder = "key";
        keyInput.spellcheck = false;
        const valTd = document.createElement("td");
        valTd.className = "fm-val";
        const valueInput = document.createElement("input");
        valueInput.className = "fm-val-input";
        valueInput.value = value;
        valueInput.placeholder = "value";
        valueInput.spellcheck = false;
        const delTd = document.createElement("td");
        delTd.className = "fm-del";
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "fm-del-btn";
        delBtn.textContent = "✕";
        delBtn.setAttribute("aria-label", t("Delete"));
        delBtn.addEventListener("click", () => {
            const index = Number(tr.dataset.fmIndex ?? -1);
            if (index >= 0) entries[index] = null; // null keeps raw-row positions intact
            tr.remove();
            flushSave();
        });
        delTd.appendChild(delBtn);
        keyTd.appendChild(keyInput);
        valTd.appendChild(valueInput);
        tr.append(keyTd, valTd, delTd);
        tbody.appendChild(tr);
        keyInput.addEventListener("input", scheduleSave);
        valueInput.addEventListener("input", scheduleSave);
        keyInput.addEventListener("blur", flushSave);
        valueInput.addEventListener("blur", flushSave);
        keyInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") { e.preventDefault(); valueInput.focus(); }
        });
        valueInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                appendRow();
                tbody.querySelector<HTMLInputElement>("tr:last-child .fm-key-input")?.focus();
            }
        });
    };

    /** Append a new kv row after the raw rows. */
    const appendRow = (): void => {
        entries.push({ type: "kv", key: "", value: "" });
        addRow("", "", entries.length - 1);
    };

    for (const [index, entry] of entries.entries()) {
        if (entry?.type === "kv") addRow(entry.key, entry.value, index);
    }

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "fm-add-btn";
    addBtn.textContent = "+";
    addBtn.setAttribute("aria-label", t("Add"));
    // Stop mousedown from stealing focus and bubbling to document-level listeners; the click
    // handler moves focus to the new row explicitly.
    addBtn.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
    addBtn.addEventListener("click", () => {
        appendRow();
        const keyInput = tbody.querySelector<HTMLInputElement>("tr:last-child .fm-key-input");
        // focus() is enough now that mousedown preventDefault removes the focus theft; the old
        // setTimeout + rAF layers were removed with the root cause (regression P7).
        keyInput?.focus();
    });
    panel.appendChild(addBtn);

    return {
        panel,
        dispose() {
            disposed = true;
            clearTimer();
            panel.remove();
        },
    };
}
