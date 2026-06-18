# EPYTOR🦖

[![Version](https://img.shields.io/github/package-json/v/peiyucn/epytor?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.epytor-vscode)
[![VS Marketplace](https://img.shields.io/badge/VS%20Marketplace-epytor-blue?style=for-the-badge)](https://marketplace.visualstudio.com/items?itemName=peiyucn.epytor-vscode)
[![License](https://img.shields.io/github/license/peiyucn/epytor?style=for-the-badge)](https://github.com/peiyucn/epytor/blob/main/LICENSE)

[简体中文](README.zh-CN.md) | English | [GitHub](https://github.com/peiyucn/epytor)

A WYSIWYG Markdown editor for VS Code, powered by [Milkdown](https://milkdown.dev/). Edit `.md` / `.markdown` as rich text, saved as standard Markdown.

> **Project starts at v1.1.0**, forked from [git-xing/md-wysiwyg-editor](https://github.com/git-xing/md-wysiwyg-editor) (MIT) v0.1.6.
>
> v0.1.6 → v1.1.0: rebuilt foundations (Milkdown 7.21.2 + Crepe / CodeMirror 6), new features (LaTeX math / image resize & caption / image picker), streamlined bloat, fixed bugs (incl. blank-line accumulation). See [CHANGELOG](CHANGELOG.md).

## Features

- **Rich text**: headings, bold, italic, strikethrough, inline code, blockquote, horizontal rule, lists
- **LaTeX math**: inline `$...$` / block `$$...$$`, KaTeX rendering
- **Tables**: GFM tables, insert/delete rows & columns, drag reorder, column alignment
- **Code blocks**: CodeMirror 6 highlighting, language picker, copy, fullscreen
- **Mermaid diagrams**: inline rendering, source/preview toggle
- **Images**: paste/drag/picker insert, drag resize, caption, load retry
- **TOC**: auto-generated, pinnable, click to navigate
- **Path autocomplete**: `@/`, `./`, `../` triggers directory browsing
- **Toolbars**: sticky top bar + floating selection toolbar
- **Auto save**: writes to disk 1s after editing stops

## Settings

| Setting | Default | Description |
|---|---|---|
| `epytor.autoSave` | `true` | Auto save on edit |
| `epytor.autoSaveDelay` | `1000` | Auto save delay (ms) |
| `epytor.defaultMode` | `"wysiwyg"` | Default open mode |
| `epytor.editorMaxWidth` | `900` | Editor max width (px) |
| `epytor.fontFamily` | `""` | Editor font family |
| `epytor.codeBlockMaxHeight` | `600` | Code block max height (px) |
| `epytor.imageStorage` | `"local"` | Image storage: `local` / `server` |
| `epytor.imageLocalPath` | `""` | Local image path |
| `epytor.debugMode` | `false` | Debug mode |

> See Settings UI for all options (`epytor.*`).

## Requirements

- VS Code **1.93.0**+

## Known Limitations

- Table cell click-selection temporarily disabled (Crepe upstream instability — clicks go to edit mode instead)
- Ordered list multi-level numbering uses decimal only (Milkdown kernel limitation)
- Global search may not scroll precisely with multiple `.md` files open
- Some extended Markdown syntax (footnotes, inline HTML, etc.) not yet supported

---

![](./images/icon.png "ratio:0.09")  ***EPYTOR, Coding with DeepSeek V4 Pro powered by Claude Code.***
