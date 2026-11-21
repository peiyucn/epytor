
import "./frontmatterPanel.css";
import { parseFrontmatter, serializeFrontmatter, type FrontmatterEntry, type FrontmatterRow } from "@/markdown/frontmatter";
import { t } from "@/i18n";

export interface FrontmatterPanelHandle {
    panel: HTMLElement;

    dispose(): void;
}

const SAVE_DEBOUNCE_MS = 300;

export function createFrontmatterPanel(
    frontmatter: string,
    onChange: (serialized: string) => void,
): FrontmatterPanelHandle | null {
    const parsed = parseFrontmatter(frontmatter);
    if (!parsed.some((entry) => entry.type === "kv")) return null;


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
            if (index >= 0) entries[index] = null;
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


    addBtn.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
    addBtn.addEventListener("click", () => {
        appendRow();
        const keyInput = tbody.querySelector<HTMLInputElement>("tr:last-child .fm-key-input");


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
