/**
 * Mermaid initialisation policy.
 *
 * Kept in its own module so the wiring can be asserted by importing it: the previous test
 * scraped `editor.ts` for `suppressErrorRendering: true`, which broke on any refactor of that
 * file while proving nothing about the value actually passed to mermaid.
 */
export interface MermaidInitConfig {
    startOnLoad: boolean;
    theme: "dark" | "default";
    /**
     * Never let mermaid draw its error bomb: that SVG is appended to `<body>` and stays at the
     * page bottom. Throwing instead lets the preview show a one-line error.
     */
    suppressErrorRendering: boolean;
}

export function mermaidInitConfig(dark: boolean): MermaidInitConfig {
    return {
        startOnLoad: false,
        theme: dark ? "dark" : "default",
        suppressErrorRendering: true,
    };
}
