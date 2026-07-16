# 贡献指南

欢迎贡献！以下是参与开发的指引。

> **说明：** 编码规范、架构约束、测试标准统一维护在 [AGENTS.md](./AGENTS.md) 中。本文件仅覆盖开发环境与提交流程——完整规范见 AGENTS.md。

## 开发环境

```bash
# 前置条件：Node.js 18+、pnpm 10+
pnpm install
pnpm build
```

在 VS Code 中按 **F5** 启动调试实例，即可加载扩展。

## 构建

由 `esbuild.mjs` 完成双目标构建：

| 目标 | 输出 | 运行时 |
|------|------|--------|
| Extension | `dist/extension.js` | Node.js（`tsconfig.json`） |
| WebView | `dist/webview.js` + `dist/webview.css` | Browser（`tsconfig.webview.json`） |

```bash
pnpm build         # 开发构建
pnpm watch         # 监听模式
pnpm run package   # 打包输出 releases/*.vsix
```

## 编码规范

编码和测试标准详见 [AGENTS.md](./AGENTS.md)：

- [开发规则](./AGENTS.md#开发) —— 包管理器、TypeScript、commit 格式、架构约束、关键文件
- [测试标准](./AGENTS.md#测试) —— 技术栈、覆盖率要求、强制流程、Mock 规范

快速参考：

- **包管理器**：必须用 `pnpm`，禁止 npm / yarn
- **通信**：WebView ↔ Extension 只通过 `webview/messaging.ts`
- **CSS**：必须使用 `--vscode-*` 变量以适配亮/暗主题
- **Git commit**：英文类型前缀 + 中文描述（例：`feat: 新增功能`）
- **测试**：`pnpm test` 必须在 push 前通过（CI 在每次 push/PR 到 `main`/`dev` 时自动运行，见 `.github/workflows/ci.yml`）

## 提交变更

1. 从 `dev` 分支创建新分支：`git checkout -b feature/your-feature`
2. 编写代码、测试，执行 `pnpm test` + `pnpm build` 验证
3. 向 **`dev`** 分支发起 Pull Request

> **说明：** `dev` 是活跃开发分支，`main` 是稳定发布分支——请勿向 `main` 发起 PR。

## 报告 Bug

请在 [GitHub Issue](https://github.com/peiyucn/epytor/issues/new) 中提交，附上 VS Code 版本号和 Output 面板（`EPYTOR` 频道）的相关日志。
