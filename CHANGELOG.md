# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [1.0.0] - 2026-06-16

从 [git-xing/md-wysiwyg-editor](https://github.com/git-xing/md-wysiwyg-editor) v0.1.6 (MIT) fork 而来，作为独立项目的首个正式版本。

### Added

- 底部状态栏**字数统计**：行数、字数、字符数，实时更新
- **TOC 面板增强**：固定按钮、拖拽调整宽度、标题折叠/展开，状态持久化

### Changed

- 所有标识（viewType、命令、配置键）从 `markdownWysiwyg.*` 改为 `epytor.*`，可与源扩展共存

### Fixed

- 编辑过程中**空行漂移**：空行逐渐向文件顶部移动的问题
