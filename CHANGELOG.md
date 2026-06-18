# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## \[1.1.0] - 2026-06-18

### Added

- **LaTeX math formulas**: inline `$...$` and block `$$...$$` via Crepe `feature/latex` (KaTeX + CodeMirror editing)
- **Brand mark**: "EPYTOR🦖" displayed at the top-left toolbar corner (pure CSS)
- **Test document**: `test.md` covering headings, inline styles, lists, tables, code blocks, Mermaid, LaTeX, quotes, links, images, and more

### Changed

- **Architecture upgrade**: Milkdown 7.5.x → 7.21.2, `Editor.make()` → `CrepeBuilder`, Prism → CodeMirror 6
- **Link popup**: custom `linkPopup` (679 lines) replaced by Crepe `feature/link-tooltip`; VSCode-themed CSS
- **Top bar**: sticky `position: fixed` with frosted glass (`backdrop-filter: blur`); unified button size (24×24px, 3px radius)
- **Selection toolbar**: frosted glass background, compact buttons matching top bar style
- **Table**: custom table UI (1,562 lines) replaced by Crepe `feature/table`; single-click to cursor fix
- **Code block**: custom Prism-based NodeView (1,909 lines) replaced by Crepe `feature/code-mirror`; preview toggle, copy feedback, fullscreen, consistent button order via CSS `order`
- **Toolbar**: custom toolbar (1,825 lines) replaced by Crepe `feature/top-bar` + `feature/toolbar`; heading labels abbreviated to P/H1–H6
- **TOC panel**: positioned below top bar (`top: 36px`), frosted glass, full-height toggle strip; when pinned, toolbar shifts via `paddingLeft` (background stays full-width)
- **Image**: resize handle (L‑shaped, CSS cursor), simplified toolbar, auto-width rename input
- **Lists**: indent controlled via `.milkdown-list-item-block` (Crepe uses `<div>` not `<ul>`)
- **Mermaid**: case-insensitive language tag, unified theme switching with CodeMirror
- **Font stack**: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system sans-serif fallback
- CSS `!important` overrides moved to Crepe CSS variables (`--crepe-color-*` → `--vscode-*`) for theme compatibility

### Removed

- `webview/components/codeBlock/` (1,909 lines) → Crepe `feature/code-mirror`
- `webview/components/linkPopup/` (679 lines) → Crepe `feature/link-tooltip`
- `webview/components/table/` (1,562 lines) → Crepe `feature/table`
- `webview/components/toolbar/` (1,825 lines) → Crepe `feature/top-bar` + `feature/toolbar`
- `webview/highlighter.ts` (82 lines) → CodeMirror 6 syntax highlighting
- **Total**: 6,057 lines removed, ~2,400 net reduction

### Fixed

- Empty table cells serialized with `<br />` in Markdown source (`test.md` cleaned)
- Code block language selector freeze (invalid `load: async () => undefined`)
- Mermaid preview not showing with capital "Mermaid" language tag
- Heading selector dropdown width not matching button width
- Link click navigation in VSCode WebView (capture-phase `preventDefault` + `stopImmediatePropagation`)
- Link tooltip staying visible on scroll (`pointerleave` dispatch)

### Known Limitations

- Ordered list multi-level numbering: all levels use decimal (1. 2. 3.) — Milkdown kernel limitation, tracked as `known-limitation`

## \[1.0.1] - 2026-06-16

### Changed

- README: English is now the default language (Chinese → `README.zh-CN.md`)
- CHANGELOG: switched to English

## \[1.0.0] - 2026-06-16

Initial release, forked from [git-xing/md-wysiwyg-editor](https://github.com/git-xing/md-wysiwyg-editor) v0.1.6 (MIT).

### Added

- **Word count** in the VS Code status bar (lines, words, characters), updated in real time
- **Enhanced TOC panel**: pin button, resizable width (200–500px), collapse/expand headings, state persistence

### Changed

- All identifiers (viewType, commands, config keys) migrated from `markdownWysiwyg.*` to `epytor.*`; can coexist with the original extension

### Fixed

- **Blank-line drift**: blank lines progressively drifting toward the top of the file during editing cycles
