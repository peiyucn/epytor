
export type TableWrapMode = "wrap" | "nowrap";


export function normalizeTableWrapMode(value: unknown): TableWrapMode {
    return value === "nowrap" || value === "none" ? "nowrap" : "wrap";
}

export interface TableWrapVars {

    wordBreak: "keep-all" | "break-all";

    whiteSpace: "normal" | "nowrap";

    overflowX: "visible" | "auto";

    tableWidth: "auto" | "max-content";
}


export function resolveTableWrapVars(mode: string): TableWrapVars {
    switch (mode) {
        case "nowrap":
        case "none":
            return { wordBreak: "keep-all", whiteSpace: "nowrap", overflowX: "auto", tableWidth: "max-content" };
        default:
            return { wordBreak: "break-all", whiteSpace: "normal", overflowX: "visible", tableWidth: "auto" };
    }
}
