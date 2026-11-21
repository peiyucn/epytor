# 架构

## 定位

EPYTOR 是 VS Code 的所见即所得 Markdown 编辑器，基于 Milkdown（Crepe）7.22.3。用户编辑的始终是磁盘上的 Markdown 文件；扩展不拥有持久化格式。

## 源码分区

- `src/`：Extension 端。`extension.ts` 注册 CustomEditorProvider；`MarkdownDocument.ts` 是文档模型；`MarkdownEditorProvider.ts` 编排面板、消息路由、保存与 revert、frontmatter。`src/editor/` 承接图片消息、外部变更、导航、状态栏、写盘审计、路径链接、WebView HTML 与文件监听，全部通过显式接口注入。
- `webview/`：WebView 端按功能域分目录。`index.ts` 负责 DOM 脚手架与消息路由，`editor.ts` 装配 Crepe，`messaging.ts` 是双端唯一通道。`app/` 管会话与请求生命周期，`editor/` 管编辑器内核支撑，`markdown/` 管序列化与保真，`outline/`、`images/`、`table/`、`code/`、`find/`、`scroll/`、`shell/` 各自领域。
- `shared/`：双端共享的消息契约、常量与表格换行逻辑；`shared/messages.ts` 是消息类型的唯一真源。
- `docs/specs/`：功能 spec；`docs/checklists/`：手测清单；`docs/audits/`：审计与度量；`docs/tech-debt.md` 与 `docs/upstream-limits.md` 记录债务与上游限制。

## 进程边界

Extension 与 WebView 不共享运行时。所有通信只经 `webview/messaging.ts` 封装的函数；WebView 侧不直接 import VS Code API，只通过 `acquireVsCodeApi()` 取得句柄。CSS 使用 `--vscode-*` 变量适配亮/暗主题。

## 保存链路

保存是拉取式：WebView 内容变化只发脏标记；保存时（Cmd+S 或 VS Code 原生 autoSave）Extension 发 `requestContent`，WebView 序列化一次并回传。输入期间不序列化。`webview/editor/editorSession.ts` 是编辑器实例与 SavedSnapshot 的唯一所有者；`webview/app/persistence.ts` 管未落盘推送、滚动与选区持久化；`webview/markdown/markdownSerializer.ts` 与 `minimalDiff.ts` 负责保存时的归一化与最小差异。

## 构建

`esbuild.mjs` 产出两个目标：`dist/extension.js`（Node.js）与 `dist/webview.js`（Browser）。WebView 使用 `splitting: true` 产出惰性 chunk：首屏只加载 `webview.js` 与 `webview.css`，其余按需。不要为了消除 vsce 的「多文件」警告关闭 splitting，否则会回到 6.2MB 单文件、首帧卡顿的旧状态。

## 安全边界

- `src/utils/pathGuard.ts`：本地文件路径越界防护。
- `src/utils/safeBasename.ts`：Windows 保留名与非法字符净化。
- `src/utils/webviewConfigSanitize.ts`：注入 WebView 前的配置净化。
- WebView HTML 使用 CSP 与 nonce；外部 URL 走白名单；图片上传失败要给出用户可见提示，不留半成品。
- 运行期入口（消息路由、命令注册、文件监听、DOM 操作）内部 try/catch 并记录日志，不让异常冒泡。

## 依赖

包管理器固定为 pnpm。运行时依赖与产物依赖的升级按补丁版单独发布；纯 devDependencies 可并入下个版本。`pnpm-workspace.yaml` 的 overrides 用于消除重复副本与固定安全补丁版，理由见 [dependency-notes.md](dependency-notes.md)。
