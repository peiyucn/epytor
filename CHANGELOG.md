# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.1.1] - 2026-07-14

### Fixed

- **启用官方虚拟光标（Cursor Feature）**：`prosemirror-virtual-cursor` 提供 mark 边界光标指示器，左右箭头可在行内代码等样式边界切换内外侧，解决行内样式边界编辑体验问题。

### Known Limitations

- **行内样式尾部无法退出**：Milkdown 原生对空选区不处理，段落末尾的行内样式（粗体、斜体、删除线、行内代码等）无法直接退出输入普通文本。已向官方提 issue 跟踪，等待上游修复。

## [1.1.0] - 2026-07-08

### Architecture

- **Milkdown**: 7.5.x → 7.21.2, `Editor.make()` → `CrepeBuilder`
- **Syntax Highlighting**: Prism → CodeMirror 6 (highlighting, search/replace, fullscreen)
- **Package size**: 8 MB → 3.1 MB (production build + code cleanup)

### Added

- **LaTeX math**: inline `$...$` / block `$$...$$`, KaTeX rendering
- **Code block enhancements**: preview toggle, copy feedback, fullscreen, light/dark theme
- **Image features**: drag resize, caption editing, picker (upload/library/URL), auto-retry on load failure
- **Toolbar**: backdrop blur, brand badge "EPYTOR🦖", clear formatting, settings button
- **TOC panel**: aligned below toolbar, backdrop blur, pinnable/resizable/collapsible, scrollbar
- **Mermaid**: unified light/dark theme, case-insensitive
- **Editor top margin**: 52px breathing room

### Fixes

- Code block language picker freeze
- Mermaid uppercase "Mermaid" not rendering preview
- Heading dropdown width misalignment
- Link clicks navigating within WebView
- Link tooltip not closing on scroll
- Image caption not syncing alt attribute after editing
- Toolbar button icons oversized
- Editor content covered by top bar
- Selection floating toolbar covered by top bar
- Clear formatting not removing links / partial removal causing split links
- TOC click positioning inaccurate (inline formatting offset)
- Source/render toggle line positioning inaccurate (proportional interpolation fix)
- Narrow window toolbar not wrapping, overlapping brand badge
- TOC panel appearing before toolbar on initial load

### Changed

- **Blockquote**: no longer nests — toggles instead (click inside to exit, outside to enter)
- **Table**: single-click row/col selection temporarily disabled (Crepe upstream instability — click goes to edit mode)
- **Send to Claude**: permanently removed

### Known Limitations

- Ordered list multi-level numbering: decimal only (no a.b.c. / i.ii.iii.) — Milkdown kernel limitation

## \[1.0.1] - 2026-06-16

### Changed

* README: English is now the default language (Chinese → `README.zh-CN.md`)
* CHANGELOG: switched to English

## \[1.0.0] - 2026-06-16

Initial release, forked from [git-xing/md-wysiwyg-editor](https://github.com/git-xing/md-wysiwyg-editor) v0.1.6 (MIT).

### Added

* **Word count** in the VS Code status bar (lines, words, characters), updated in real time
* **Enhanced TOC panel**: pin button, resizable width (200–500px), collapse/expand headings, state persistence

### Changed

* All identifiers (viewType, commands, config keys) migrated from `markdownWysiwyg.*` to `epytor.*`; can coexist with the original extension

### Fixed

* **Blank-line drift**: blank lines progressively drifting toward the top of the file during editing cycles

