# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
每个版本条目：英文在上、中文在下（Each version entry: English first, Chinese below）。

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

### 中文

### 新增

- **列表切换**：无序/有序/任务按钮可直接互相切换（有序号自动重排）；点击当前类型回到段落

### 修复

- **Milkdown 7.22.0 升级后列表/引用按钮失效**：依赖树中多个 `prosemirror-model` 版本共存（1.25.4 / 1.25.9 / 1.25.11），导致 `tr.wrap` 抛异常；通过 `pnpm-workspace.yaml` overrides 将所有 prosemirror 包固定到单一版本链
- **引用块/行内代码内虚拟光标不可见**：`prosemirror-virtual-cursor` 渲染的光标缺 z-index，被节点背景遮挡
- **添加新列表按钮无效**：切换处理器中漏导入 `wrapInBlockTypeCommand`
- **列表切换时光标换行**：改用 `setNodeMarkup`（节点大小不变）而非重建列表节点

### 变更

- **打包**：`.vscodeignore` 排除 `pnpm-workspace.yaml`、`coverage/`、`scripts/`

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

### 中文

### 变更

- **扩展图标**：更换新 logo
- **依赖升级**：修复安全漏洞
  - Milkdown 7.21.3 → 7.22.0、Mermaid 11.15.0 → 11.16.1
  - vsce 2.32 → 3.9.2、Vitest 2 → 4、Vite 5 → 6、esbuild 0.24 → 0.28
- **测试配置**：`vitest.workspace.ts` 迁移为 `projects` 配置（适配 Vitest 4）

### 修复

- **顶栏标题下拉菜单被裁剪**：去除 overflow 裁剪
- **全屏代码语言名 XSS**：语言名改用 textContent 安全注入

## [1.1.4] - 2026-08-05

### Changed

- **Extension icon**: new logo

### 中文

### 变更

- **扩展图标**：更换新 logo

## [1.1.3] - 2026-07-16

### Changed

- **Milkdown**: 7.21.2 → 7.21.3

### Fixed

- **Virtual cursor invisible inside inline code on light themes**: removed `mix-blend-mode: difference`, use direct foreground color

### Added

- **TOC leaf nodes**: headings without children now show `–` for visual consistency

### 中文

### 变更

- **Milkdown**：7.21.2 → 7.21.3

### 修复

- **虚拟光标在浅色主题下行内代码中不可见**：移除 `mix-blend-mode: difference`，改用前景色直显

### 新增

- **TOC 叶子节点**：无子标题的条目前显示 `–`

## [1.1.2] - 2026-07-15

### Fixed

- **Virtual cursor not visible on some VSCode themes**: fallback CSS variable chain `--vscode-editorCursor-foreground` → `--vscode-editor-foreground` → `#fff` prevents transparent cursor on themes missing cursor color variable.

### 中文

### 修复

- **虚拟光标在部分 VSCode 主题下不显示**：CSS 变量回退链 `--vscode-editorCursor-foreground` → `--vscode-editor-foreground` → `#fff`，解决部分主题缺少光标颜色变量导致虚拟光标透明的问题。

## [1.1.1] - 2026-07-14

### Fixed

- **Cursor Feature enabled**: `prosemirror-virtual-cursor` provides mark boundary cursor indicator with arrow key navigation across inline style boundaries.

### Known Limitations

- **Inline styles cannot exit at paragraph end**: Milkdown does not handle empty selection for inline marks. Inline styles (bold, italic, strikethrough, inline code, etc.) at paragraph end cannot exit to normal text input. [Milkdown#2413](https://github.com/Milkdown/milkdown/issues/2413), awaiting upstream fix.

### 中文

### 修复

- **启用官方虚拟光标（Cursor Feature）**：`prosemirror-virtual-cursor` 提供 mark 边界光标指示器，左右箭头可在行内样式边界切换内外侧，解决行内样式边界编辑体验问题。

### 已知限制

- **行内样式尾部无法退出**：Milkdown 原生对空选区不处理，段落末尾的行内样式（粗体、斜体、删除线、行内代码等）无法直接退出输入普通文本。[Milkdown#2413](https://github.com/Milkdown/milkdown/issues/2413)，等待上游修复。

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

### 中文

### 架构升级

- **Milkdown**：7.5.x → 7.21.2，`Editor.make()` → `CrepeBuilder`
- **代码高亮**：Prism → CodeMirror 6（语法高亮、搜索替换、全屏编辑）
- **包体积**：8 MB → 3.1 MB（生产构建 + 代码精简）

### 新增

- **LaTeX 数学公式**：行内 `$...$` / 块级 `$$...$$`，KaTeX 渲染
- **代码块增强**：预览切换、复制反馈、全屏编辑、深浅主题自适应
- **图片功能**：拖拽缩放、Caption 编辑、选择器（本地上传/项目图片库/URL）、加载自动重试
- **工具栏**：毛玻璃吸顶、品牌标识 "EPYTOR🦖"、清除格式、设置按钮
- **TOC 面板**：对齐工具栏下方、毛玻璃、钉住/拖拽宽度/折叠展开、滚动条
- **Mermaid 图表**：统一深浅主题、大小写不敏感
- **编辑器上边距**：52px 留出呼吸空间

### 修复

- 代码块语言选择器卡死
- Mermaid 大写 "Mermaid" 无法渲染预览
- 标题下拉框宽度不对齐按钮
- 点击链接在 WebView 中跳转
- 链接 tooltip 滚动时不消失
- 图片 caption 编辑后 alt 属性不同步
- 工具栏按钮图标偏大
- 编辑器顶部内容被顶栏遮挡
- 选中浮动工具栏被顶栏覆盖
- 清除格式按钮无法清除链接、部分清除链接导致分裂
- TOC 点击定位不准（行内格式导致偏移）
- 源码/渲染切换行定位不准（段内比例插值修复）
- 窄窗口工具栏按钮不换行、与品牌标识重叠
- TOC 面板首次加载与工具栏不同步

### 变更

- **引用块**：取消嵌套，改为 toggle——引用内点击退出，引用外点击进入
- **表格**：单击选中整行/列暂时关闭（Crepe 上游行为不稳定，改为单击直接编辑，待上游修复）
- **发送到 Claude**：永久移除

### 已知限制

- 有序列表多层级编号：全部十进制，不区分 a.b.c. / i.ii.iii.（Milkdown 内核限制）

## [1.0.1] - 2026-06-16

### Changed

- README: English is now the default language (Chinese → `README.zh-CN.md`)
- CHANGELOG: switched to English

### 中文

### 变更

- README：英文改为默认语言（中文 → `README.zh-CN.md`）
- CHANGELOG：改回英文

## [1.0.0] - 2026-06-16

Initial release, forked from [git-xing/md-wysiwyg-editor](https://github.com/git-xing/md-wysiwyg-editor) v0.1.6 (MIT).

### Added

- **Word count** in the VS Code status bar (lines, words, characters), updated in real time
- **Enhanced TOC panel**: pin button, resizable width (200–500px), collapse/expand headings, state persistence

### Changed

- All identifiers (viewType, commands, config keys) migrated from `markdownWysiwyg.*` to `epytor.*`; can coexist with the original extension

### Fixed

- **Blank-line drift**: blank lines progressively drifting toward the top of the file during editing cycles

### 中文

首个正式版本，从 [git-xing/md-wysiwyg-editor](https://github.com/git-xing/md-wysiwyg-editor) v0.1.6 (MIT) fork 而来。

### 新增

- 底部状态栏**字数统计**：行数、字数、字符数，实时更新
- **TOC 面板增强**：固定按钮、拖拽调整宽度（200–500px）、标题折叠/展开，状态持久化

### 变更

- 所有标识（viewType、命令、配置键）从 `markdownWysiwyg.*` 改为 `epytor.*`，可与源扩展共存

### 修复

- **空行漂移**：编辑过程中空行逐渐向文件顶部移动的问题
