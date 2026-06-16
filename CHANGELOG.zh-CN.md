# 更新日志

本项目的所有重要变更都将记录在此文件中。
格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [1.0.1] - 2026-06-16

### Changed

- README：英文改为默认语言（中文 → `README.zh-CN.md`）
- CHANGELOG：改回英文

## [1.0.0] - 2026-06-16

首个正式版本，从 [git-xing/md-wysiwyg-editor](https://github.com/git-xing/md-wysiwyg-editor) v0.1.6 (MIT) fork 而来。

### Added

- 底部状态栏**字数统计**：行数、字数、字符数，实时更新
- **TOC 面板增强**：固定按钮、拖拽调整宽度（200–500px）、标题折叠/展开，状态持久化

### Changed

- 所有标识（viewType、命令、配置键）从 `markdownWysiwyg.*` 改为 `epytor.*`，可与源扩展共存

### Fixed

- **空行漂移**：编辑过程中空行逐渐向文件顶部移动的问题
