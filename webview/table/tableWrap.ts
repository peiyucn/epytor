import type { TableWrapVars } from "../../shared/tableWrap";

const VAR_NAMES = {
    wordBreak: "--epytor-table-word-break",
    whiteSpace: "--epytor-table-white-space",
    overflowX: "--epytor-table-overflow-x",
    tableWidth: "--epytor-table-width",
} as const;

/** Write the resolved table-wrap vars to `:root`; takes effect immediately, no reload. */
export function applyTableWrapVars(vars: TableWrapVars): void {
    const root = document.documentElement;
    root.style.setProperty(VAR_NAMES.wordBreak, vars.wordBreak);
    root.style.setProperty(VAR_NAMES.whiteSpace, vars.whiteSpace);
    root.style.setProperty(VAR_NAMES.overflowX, vars.overflowX);
    root.style.setProperty(VAR_NAMES.tableWidth, vars.tableWidth);
}
