
export interface MermaidInitConfig {
    startOnLoad: boolean;
    theme: "dark" | "default";

    suppressErrorRendering: boolean;
}

export function mermaidInitConfig(dark: boolean): MermaidInitConfig {
    return {
        startOnLoad: false,
        theme: dark ? "dark" : "default",
        suppressErrorRendering: true,
    };
}
