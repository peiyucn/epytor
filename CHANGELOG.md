# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

English | [简体中文](CHANGELOG.zh-CN.md)

## [1.3.0] - 2026-11-03

### New features

- **The status bar now shows the file size** — the existing line/word/character readout gains a `Size:` segment showing how large the file is **on disk** (e.g. `12.3 KB`, `2.4 MB`), refreshed after saving and after an external tool rewrites the file. This is the number you also see in the Explorer, which makes it easy to gauge what an AI tool is about to read or has just written

### Bug fixes

- **The editor no longer loses focus while you type** — after an automatic save, a late file-change notification from the disk (most visible in OneDrive folders) used to be mistaken for someone else editing the file; the editor was then rebuilt from scratch and lost both the keyboard focus and the characters typed since that save. Such notifications are now compared by content, so the editor only reloads when the file on disk really differs, and focus, caret and scroll position are restored afterwards
- **The caret no longer jumps back to line 1, column 1** — when the editor was rebuilt in the background (an external change while you were looking at another tab), or when its panel was reloaded, the caret silently went back to the very beginning of the document. The last caret position and the scroll offset are now remembered and restored, without stealing focus from whatever you were doing
- **Typing Chinese no longer cancels the composition** — a rebuild that arrived while the input method was composing could make the candidate window vanish; the rebuild now waits until the composition finishes
- **Backspacing an item in a nested to-do list no longer changes the levels below it** — only the item you press is lifted to the level above; the items below keep their level, and pressing Backspace on an empty nested item removes it instead of leaving an empty row at the top level
- **A full-width colon typed after formatted text no longer lands inside the mark or moves the caret past the next character** — typing `：` at the end of **bold**, *italic* or ~~strikethrough~~ text keeps it outside the formatted span, with the caret immediately after it
- **Horizontal rules are back to a hairline** — a `---` divider was being drawn as a thick grey band roughly 13 pixels tall instead of a 1-pixel line. The upstream theme paints the rule with a background colour squeezed into a one-pixel-tall content box; an override of ours reset that padding, so the colour filled the whole 13-pixel box
- **The outline sidebar's resize handle now keeps up with the panel** — when the outline opened or closed, the grab handle at its edge lagged behind the panel, and the toolbar snapped into place in a single frame while everything else glided. The handle and the panel were being animated on different rendering paths (`left` versus `transform`), and the toolbar's transition was declared on a property nothing ever changes; all three now animate together
- **A stale save can no longer roll the file back** — when a save was triggered by an old "modified" flag (for example while a panel was being deactivated) and there was nothing new to write, the unchanged buffer could overwrite a change another tool had just made on disk. Such a save is now skipped and the disk copy is left alone
- **Concurrent external edits are announced instead of silently reverted** — if another tool changes the file while you have unsaved edits, the editor keeps your content and shows a one-time warning (saving will overwrite the disk copy; use "Revert File" to load it) instead of losing your text or overwriting the other writer without notice
- **An image folder outside the workspace is reported** — when a workspace-level `epytor.imageLocalPath` points outside the workspace the image is still saved next to the document, but a notice now says so instead of the fallback happening silently
- **Images referenced with the `@/` workspace alias can be renamed again** — the rename path was resolved against the document folder, so `![x](@/assets/a.png)` failed with "Image not found"; the alias is now resolved first, like image display and path completion already did
- **Switching to the source editor no longer writes a stale buffer back** — the flush before switching now compares against the file on disk; when there is nothing new to write and the file changed externally, the write is skipped
- **A deferred external change is no longer applied before it is decided** — the editor used to load the disk copy first and decide afterwards, so a rebuild during a deferred check could still show the pre-edit text; the document model is now updated only when the change is actually adopted
- **An unreadable image folder produces a notice** — when the project image gallery cannot read the folder, the panel now says so instead of showing "no images"
- **The outline highlight no longer survives an editor rebuild** — after a rebuild (revert / external change) the outline could keep highlighting a heading position from the previous document; it now clears and waits for the new document

### Changed

- **Typing at the end of an inline mark no longer continues the format** — a caret at the end of bold/italic/strikethrough text is treated as outside the span; continued typing, including full-width punctuation, uses plain text, while typing inside the marked text keeps the format
- **Security-related development tooling updates** — the bundled extension and user-facing behavior are unchanged
- **Blank lines *between* list items are no longer added or removed automatically** — they are now treated as the author's own formatting and preserved exactly. Blank lines inside a single list item (between two of its paragraphs) are still managed automatically
- **`@/` in files that are not part of any workspace folder now always resolves next to the document** — this covers standalone files opened while another workspace is active (images, file links and path completion now share the same rule). Previously file links fell back to the parent folder while images and path completion used the document folder; they now all use the document folder, and the path-completion dropdown keeps the rest of the path (`@/a/b`) instead of dropping it

## [1.2.7] - 2026-10-22

### Changed

- **Security patches** — tooling dependencies with newly published advisories were upgraded to their fixed releases; there is no user-perceivable change

## [1.2.6] - 2026-10-21

### Bug fixes

- **The inline formula editor no longer gets buried under the outline panel** — when the outline sidebar was open, the pop-up editor for an inline formula could be placed underneath it; it now stays inside the editing area, and it no longer covers the fixed toolbar, the heading bar or the outline panel
- **Inline formulas inside a table can be selected and edited again** — clicking one used to select the whole table cell instead, so the formula editor never opened
- **The inline formula editor now looks like the other pop-up editors** — same box, border, input field, icon and font size as the link editor, instead of the previous oversized text and mismatched icon

### Changed

- **Security patches** — dependencies with known vulnerabilities were upgraded to their fixed releases
- **Mermaid syntax errors are reported in place** — a broken diagram used to leave a large error picture at the very bottom of the document; the error now appears inside that code block only

## [1.2.5] - 2026-10-18

### Bug fixes

- **Saving no longer rewrites loose lists** — version 1.2.4 could drop the blank lines between list items when a file was saved without any edit (the list silently turned from loose into tight); saving an untouched document is now byte-for-byte identical again
- **Repeated Enter in a to-do list no longer sprouts a plain bullet** — in a nested task list, pressing Enter on an empty task item used to turn it into a plain bullet item first and only then leave the list; the empty item now moves up one level as a task item instead (at the top level it leaves the list)

## [1.2.4] - 2026-10-18

### Changed

- **Milkdown upgraded to 7.22.3** (from 7.22.1) — brings upstream bug fixes (table cells keeping hand-written line breaks, list-marker click handling, autolink and image serialization) and performance work; the editor behaves the same in daily use (save fidelity, tables, lists and task items re-verified)

## [1.2.3] - 2026-10-17

### Bug fixes

- **A new to-do item no longer starts out checked** — pressing Enter inside a completed task item (`- [x] …`) used to add the next item already ticked; newly created items now always start unchecked, and the item you were in keeps its own state

## [1.2.2] - 2026-09-18

### Bug fixes

- **The outline panel no longer flickers while you type** — every keystroke used to rebuild the whole list (items repainted, the panel's own scroll position reset); it is now rebuilt only when the heading structure actually changes
- **Click-to-jump in the outline panel is now accurate** — the highlight lands on the item you clicked (it used to stay on the previous one, and clicking the first item highlighted nothing); short documents behave the same
- **The whole row in the outline panel is clickable** — previously only the text itself responded; clicks on the row's blank area did nothing
- **In-document anchor links** — clicking a percent-encoded link to a heading with non-ASCII characters no longer does nothing

## [1.2.1] - 2026-09-13

### Bug fixes

- **The editor is listed as `Markdown Editor - EPYTOR`** under *Reopen Editor With…* — it used to read `EPYTOR - EPYTOR`, because VS Code always appends the extension name to an editor contributed by an extension

## [1.2.0] - 2026-09-13

### Features

- **Clean Markdown serialization mode** (`epytor.serializationMode`: `clean` / `compatible`) — minimizes unnecessary escaping and redundant table breaks; default `clean` (#15, thanks @Jurhoo)
- **Source ↔ preview keeps your place** — switching between the WYSIWYG editor and the text/preview tab returns to the same position, from any entry point (menu, shortcut, command palette, search results)
- **Table grid picker**: an 8×8 grid on the insert-table button, any rows × columns
- **Regular-expression search** in the find bar (`.*` toggle) with invalid-pattern feedback and zero-width match protection
- **Heading sticky title** (up to three levels, pinned as soon as the heading reaches the top) **with sibling folding** — the document itself is never modified
- **Table wrap modes** (`epytor.tableWrapMode`: `wrap` / `nowrap`) plus Shift+Enter soft breaks inside cells
- **Editable frontmatter panel** — add, edit and remove key/value rows in place
- **Toolbar overflow menu** — buttons collapse into a "⋯" menu on narrow windows
- **Mermaid preview zoom** (0.2×–3×, with reset and horizontal scroll)

### Experience

- **Switching tabs no longer rebuilds the editor** — undo/redo history, scroll position and folded headings survive tab switches because the editor is still there, not restored after a rebuild
- **`.markdown` files get the same menu and `Ctrl/Cmd+Shift+M` shortcut as `.md`**
- **The editor is now listed as `EPYTOR`** under *Reopen Editor With…* (it used to read `WYSIWYG Markdown Editor - EPYTOR`)
- **Brand mark is now `🦖EPYTOR`** (emoji first, matching dsh-sparrow; updated in the top bar and both READMEs)
- **Backspace at the start of a list item now breaks the list**: the item becomes a plain line instead of merging into the line above, and when an ordered list is split this way the second half continues the numbering instead of restarting at 1
- **Auto save follows the built-in VS Code `files.autoSave`** (`off` / `afterDelay` / `onFocusChange` / `onWindowChange`); `epytor.autoSave` and `epytor.autoSaveDelay` are gone
- **Table cell padding, line spacing and the row/column selection toolbar** are unified with the rest of the editor
- **The whole document now uses one spacing scale**: a single line height (shared by paragraphs, list items, blockquotes and table cells) and a single gap between adjacent blocks (10.5px), with headings and rules taking the 2× step of the same scale. Before, the gap between adjacent blocks came in six different values (2.8 / 4 / 4 / 4 / 18.2 / 21px) and heading spacing scaled with the heading's own font size (h1 to its next block 11.2px, h6 only 5.0px)
- **Lists**: markers (bullet / number / checkbox) are centred on the text of their own line, item spacing matches paragraph spacing, and each nesting level indents 27px instead of 55px
- **Blockquotes and table cells** now have equal top and bottom padding, equal to the document-wide block gap
- **Soft line breaks in the source no longer add an extra line**: two lines of text are two lines, with no blank line appearing in between
- **Heading fold buttons moved outside the text column**: every heading lines up with the body text, with the button hanging in the left margin and fading in when you hover the heading
- **The outline (TOC) now has just two states**: open means it stays and pushes the text aside, and **closing it wins above everything** — once dismissed it never comes back on its own, however the window is resized; whether an opened TOC stays is decided by the window width (threshold = your editor width setting + 100, so it follows `epytor.editorMaxWidth`). The pin and collapse-all buttons are gone, the panel title is simply **Contents** (「目录」 in Chinese), and the edge handle is now a direction arrow (› when closed, ‹ when open)
- **Word-style multilevel list markers**: numbered lists show `1.` / `a)` / `i.` and bullets show ● / ■ / ◆ by nesting level, cycling back at the fourth level (your Markdown source and saved files are unchanged — the file keeps `1.` numbering and the bullet marker you wrote)
- **Failures are no longer silent**: image upload, image rename, save and switch failures explain what went wrong, and several messages that stayed English in a Chinese UI are translated
- **Settings are grouped** into *epytor* (editor) and *epytor › Images*, and **`e`epytor.editorMaxWidth`` / `epytor.codeBlockMaxHeight` apply immediately** — no need to reopen the tab
- **Image server settings are merged into one `epytor.imageServer` object** (`url` / `fieldName` / `extraParams` / `responsePath`), and `extraParams` is now a real JSON object. Migrating is recommended: `epytor.imageServerUrl`, `imageServerFieldName`, `imageServerExtraParams` and `imageServerResponsePath` still work as a fallback but are marked deprecated
- **`epytor.markdown.serializationMode` was renamed to `epytor.serializationMode`** (the old key was never released)
- **Four settings were removed**: `epytor.defaultMode` (use the built-in **Reopen Editor With… → Configure default editor**), `epytor.fontFamily` (the editor now follows your VS Code editor font), `epytor.imageSelectionColor` (the selection frame follows the VS Code theme colour) and `epytor.debugMode` along with the `epytor.toggleDebugMode` command

### Performance

- **Opening a Markdown file is significantly faster**: the editor payload loads on demand (Mermaid, KaTeX and per-language syntax support only when used) and post-open bookkeeping no longer blocks the first frame
- **Typing in large documents no longer stutters every few hundred milliseconds** — nothing is processed in the background while you type; the document is handed over after you stop
- **Large-document input lag** (#16, thanks to @Jurhoo for the report and the initial diagnosis): large documents are now smooth — how far the editor keeps up depends on your machine, not on per-edit work (see Known Limitations). Following their diagnosis, the whole-document diff that ran on every edit was replaced by a line-anchor based local change; this release also stopped all background full-document work while typing (hand-over happens after you stop), rebuilt the sticky-heading cache on document coordinates with debouncing (zero DOM queries while scrolling), made serialization pull-based (zero serialization while typing), and pinned undo granularity to one step per typing burst
- **Search stays responsive on huge files**: highlighting is capped instead of building tens of thousands of ranges

### Bug fixes

- **External writes are no longer overwritten by auto save** — files changed by scripts or AI assistants keep their content
- **Explorer clicks no longer make tabs flash**, and switching documents no longer leaves the editor unable to receive input
- **Source ↔ preview**: the cursor no longer jumps back to line 1 or to the wrong block, and large files no longer lose their position when switching back
- **Images**: paths with spaces or parentheses no longer break or get mangled on save, an image title is no longer swallowed into the path (which caused 404s), rename failures are reported instead of silent, Windows reserved names are rejected, and upload failures, timeouts and oversized files are reported
- **Global search**: clicking a non-Markdown result no longer jumps to the top of the file or scrolls other Markdown documents
- **Your "Open With" choice for `.md` files is no longer silently removed**
- **Find bar**: a closed find bar no longer runs the previous search, and invalid patterns are reported
- **A paragraph written across several source lines no longer gains an extra blank line**: soft line breaks used to be rendered as a full-height block
- **Saving no longer rewrites your list syntax**: bullet markers (`-` / `*` / `+`), the ordered-list style (`1.` or `1)`) and nested-list indentation are kept exactly as written — only the lines you actually changed are rewritten
- **Saving no longer rewrites your file's line endings or escapes URLs**: a CRLF file used to be written back as LF (and, because of that mismatch, the whole document was treated as changed and re-serialized), and `&` in link targets was escaped to `\&` — both are gone; what you did not touch is written back byte for byte
- **Empty checkboxes are recognised**: `- [ ] ` (nothing written after the marker) now shows a checkbox instead of a bullet with the literal text `[ ]`, and saving keeps the line as you wrote it
- **Outline panel**: the closing sections of a document now light up in order as you scroll to the end, and the last one takes over at the very bottom — before, they could never become current (a short closing section can never reach the sticky line), so the highlight was stuck one section early and the panel could not scroll to its end
- **Path and language autocomplete**: keyboard navigation keeps its highlight
- **Editor focus restored** when switching back from another file (cursor visible but input dead)
- **Security**: external links are limited to http/https/mailto; image paths, the image gallery listing and path links can no longer escape the workspace; image-server settings injected by a workspace are never used for uploads (the image is saved locally and a notice is shown) and a plain-http image server is flagged once; upload errors no longer echo the server response body
- **Milkdown** upgraded 7.22.0 → 7.22.1 (inline-code mark fix and a dompurify security update)
- **Dependencies**: security patch upgrades (`nanoid` 3.3.17 → 3.3.19, `fast-uri` 3.1.5 → 3.1.7, `js-yaml` 4.3.1 → 4.3.2, `vitest` 4.1.10 → 4.1.11, from Dependabot alerts) — none of them ends up in the extension itself, so there is no user-perceivable change

## [1.1.6] - 2026-08-06

### Added

- **List switching**: bullet/ordered/task buttons now switch between each other in-place (ordered numbering reflows); clicking the current type lifts back to paragraph

### Fixed

- **List/blockquote buttons broken after Milkdown 7.22.0**: multiple `prosemirror-model` versions coexisted in the dependency tree (1.25.4 / 1.25.9 / 1.25.11), breaking `tr.wrap` → pinned all prosemirror packages to a single version chain via `pnpm-workspace.yaml` overrides
- **Virtual cursor invisible inside blockquote/inline code**: cursor rendered by `prosemirror-virtual-cursor` lacked z-index, hidden behind node backgrounds
- **List wrap button no-op**: `wrapInBlockTypeCommand` import was missing in the toggle handler
- **List switch moved the cursor to a new line**: switching now uses `setNodeMarkup` (node size unchanged) instead of rebuilding the list node

### Changed

- **Packaging**: `.vscodeignore` excludes `pnpm-workspace.yaml`, `coverage/`, `scripts/`

## [1.1.5] - 2026-08-05

### Changed

- **Extension icon**: new logo
- **Dependencies**: upgraded to fix security vulnerabilities
  - Milkdown 7.21.3 → 7.22.0, Mermaid 11.15.0 → 11.16.1
  - vsce 2.32 → 3.9.2, Vitest 2 → 4, Vite 5 → 6, esbuild 0.24 → 0.28
- **Test config**: migrated `vitest.workspace.ts` to `projects` (Vitest 4)

### Fixed

- **Top bar heading dropdown clipped**: overflow clipping removed
- **Fullscreen code language XSS**: language name now safely injected via textContent

## [1.1.4] - 2026-08-05

### Changed

- **Extension icon**: new logo

## [1.1.3] - 2026-07-16

### Changed

- **Milkdown**: 7.21.2 → 7.21.3

### Fixed

- **Virtual cursor invisible inside inline code on light themes**: removed `mix-blend-mode: difference`, use direct foreground color

### Added

- **TOC leaf nodes**: headings without children now show `–` for visual consistency

## [1.1.2] - 2026-07-15

### Fixed

- **Virtual cursor not visible on some VSCode themes**: fallback CSS variable chain `--vscode-editorCursor-foreground` → `--vscode-editor-foreground` → `#fff` prevents transparent cursor on themes missing cursor color variable.

## [1.1.1] - 2026-07-14

### Fixed

- **Cursor Feature enabled**: `prosemirror-virtual-cursor` provides mark boundary cursor indicator with arrow key navigation across inline style boundaries.

### Known Limitations

- **Inline styles cannot exit at paragraph end**: Milkdown does not handle empty selection for inline marks. Inline styles (bold, italic, strikethrough, inline code, etc.) at paragraph end cannot exit to normal text input. [Milkdown#2413](https://github.com/Milkdown/milkdown/issues/2413), awaiting upstream fix.

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

## [1.0.1] - 2026-06-16

### Changed

- README: English is now the default language (Chinese → `README.zh-CN.md`)
- CHANGELOG: switched to English

## [1.0.0] - 2026-06-16

Initial release, forked from [git-xing/md-wysiwyg-editor](https://github.com/git-xing/md-wysiwyg-editor) v0.1.6 (MIT).

### Added

- **Word count** in the VS Code status bar (lines, words, characters), updated in real time
- **Enhanced TOC panel**: pin button, resizable width (200–500px), collapse/expand headings, state persistence

### Changed

- All identifiers (viewType, commands, config keys) migrated from `markdownWysiwyg.*` to `epytor.*`; can coexist with the original extension

### Fixed

- **Blank-line drift**: blank lines progressively drifting toward the top of the file during editing cycles
