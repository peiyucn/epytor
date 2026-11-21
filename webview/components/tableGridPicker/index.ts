
import "./tableGridPicker.css";
import { TABLE_GRID_SIZE, gridIndexToCell, isCellHighlighted } from "@/table/tableGrid";
import { t } from "@/i18n";
import { openAnchoredOverlay, type AnchoredOverlay } from "@/ui/anchoredOverlay";

const CELL_SIZE_PX = 18;
const CELL_GAP_PX = 2;
const PANEL_PADDING_X_PX = 16;
const PANEL_PADDING_Y_PX = 40;
const PANEL_WIDTH_PX = TABLE_GRID_SIZE * CELL_SIZE_PX + (TABLE_GRID_SIZE - 1) * CELL_GAP_PX + PANEL_PADDING_X_PX;
const PANEL_HEIGHT_PX = TABLE_GRID_SIZE * CELL_SIZE_PX + (TABLE_GRID_SIZE - 1) * CELL_GAP_PX + PANEL_PADDING_Y_PX;
const VIEWPORT_MARGIN_PX = 8;
const GAP_PX = 6;

let _activePanel: AnchoredOverlay | null = null;

export function closeTableGridPicker(): void {
    closeActivePanel();
}

function closeActivePanel(): void {
    _activePanel?.dispose();
    _activePanel = null;
}

export function openTableGridPicker(
    anchor: HTMLElement,
    onPick: (rows: number, cols: number) => void,
): void {

    closeActivePanel();

    const panel = document.createElement("div");
    panel.className = "epytor-grid-picker";
    panel.setAttribute("role", "grid");
    panel.setAttribute("aria-label", t("Insert Table"));

    const label = document.createElement("div");
    label.className = "epytor-grid-picker__label";
    label.textContent = t("Insert Table");

    const grid = document.createElement("div");
    grid.className = "epytor-grid-picker__grid";

    const cells: HTMLElement[] = [];
    for (let i = 0; i < TABLE_GRID_SIZE * TABLE_GRID_SIZE; i++) {
        const cell = document.createElement("div");
        cell.className = "epytor-grid-picker__cell";
        cell.setAttribute("role", "gridcell");
        const { row, col } = gridIndexToCell(i);
        cell.setAttribute("aria-label", `${row} × ${col}`);
        grid.appendChild(cell);
        cells.push(cell);
    }

    panel.append(label, grid);

    const updateHover = (hoverIdx: number) => {
        const { row, col } = gridIndexToCell(hoverIdx);
        cells.forEach((cell, idx) => {
            cell.classList.toggle(
                "epytor-grid-picker__cell--active",
                isCellHighlighted(idx, row, col),
            );
        });
        label.textContent = `${row} × ${col}`;
    };

    grid.addEventListener("mouseover", (e) => {
        const cell = (e.target as Element).closest(".epytor-grid-picker__cell") as HTMLElement | null;
        if (cell) updateHover(cells.indexOf(cell));
    });

    grid.addEventListener("click", (e) => {
        const cell = (e.target as Element).closest(".epytor-grid-picker__cell") as HTMLElement | null;
        if (!cell) return;
        const { row, col } = gridIndexToCell(cells.indexOf(cell));
        closeActivePanel();
        onPick(row, col);
    });

    _activePanel = openAnchoredOverlay({
        el: panel,
        anchor,
        align: "left",
        gap: GAP_PX,
        viewportMargin: VIEWPORT_MARGIN_PX,
        viewportRightMargin: VIEWPORT_MARGIN_PX,

        viewportWidth: () => window.innerWidth,
        size: { width: PANEL_WIDTH_PX, height: PANEL_HEIGHT_PX },
    });
}
