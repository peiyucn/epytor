# 贡献指南

欢迎贡献！以下是参与开发的指引。

## 开发环境

```bash
# 前置条件：Node.js 18+、pnpm 10+
pnpm install
pnpm build
```

在 VS Code 中按 **F5** 启动调试实例，即可加载扩展。

## 项目结构

```
src/                          Extension 端（Node.js）— VSCode API、文件 I/O
  extension.ts                扩展入口，注册 CustomEditorProvider
  MarkdownEditorProvider.ts   Provider 核心（消息路由、自动保存、revert）
  MarkdownDocument.ts         文档模型
  utils/
    getNonce.ts               CSP nonce 生成
    imageService.ts           图片本地保存（MD5 去重）+ 服务器上传
    contentTransform.ts       Markdown 内容转换
    lineMap.ts                源码行号映射
  i18n/
    webviewTranslations.ts    WebView 翻译数据
webview/                      WebView 前端（Browser）
  index.ts                    入口（消息路由、DOM 事件委托、品牌标识注入）
  editor.ts                   CrepeBuilder 入口（Milkdown 7.21.2 + Crepe 功能注册）
  messaging.ts                WebView ↔ Extension 消息协议
  style.css                   VSCode 主题全覆盖（--vscode-* CSS 变量）
  headingIds.ts               标题 id 管理（不操作 DOM，仅保留签名）
  i18n/                       翻译函数 t() / kbd()
  ui/                         共享 UI 工具（SVG 图标、tooltip）
  utils/                      主题总线、slug 等
  components/
    selectionToolbar/         选中工具栏（浮动格式菜单）
    toc/                      目录（TOC）面板
    imageView/                图片 NodeView（选中/lightbox/缩放）
    findBar/                  编辑器内查找栏（Ctrl/Cmd+F）
    pathLink/                 路径链接自动补全
shared/                       共享类型（Extension ↔ WebView）
__mocks__/                    VSCode API mock（通过 vitest alias 注入）
docs/
  roadmap.md                  项目路线图
  specs/                      功能 spec 文档
  CHANGELOG.md                发布日志
```

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

- **全部 TypeScript**
- **包管理器**：必须用 `pnpm`，禁止 npm / yarn
- **WebView ↔ Extension 通信**只通过 `webview/messaging.ts`
- **CSS** 必须使用 `--vscode-*` 变量以适配亮/暗主题
- **禁止 DOM 刮削**：优先使用框架/插件 API，而非 MutationObserver 补丁式写法
- **Git commit 规范**：
  - 类型前缀用英文：`feat:`、`fix:`、`refactor:`、`chore:`、`docs:`、`test:`
  - 描述部分用**中文**
  - 示例：`feat: 新增 TOC 工具栏按钮`
  - 末尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## 测试

### 技术栈

| 层次 | 框架 | 适用范围 |
|------|------|----------|
| Extension 单元测试 | **Vitest 2.x**（Node） | `src/utils/`、`src/MarkdownDocument.ts` |
| WebView 单元测试 | **Vitest 2.x + jsdom 24.x** | `webview/utils/`、`webview/messaging.ts` |
| 集成测试（计划中） | **@vscode/test-electron + Mocha** | 真实 VSCode Extension Host |

`vscode` 模块通过 `__mocks__/vscode.ts` 统一 mock，由 `vitest.config.ts` 的 `resolve.alias` 注入。**禁止**在单个测试文件中使用 `vi.mock("vscode")`。

### 目录与命名规范

```
src/__tests__/           Extension 侧单元测试（Node 环境）
webview/__tests__/       WebView 侧单元测试（jsdom 环境）
webview/__tests__/setup.ts  jsdom 全局 setup（注入 acquireVsCodeApi）
shared/__tests__/        共享类型测试
__mocks__/vscode.ts      统一 vscode API mock
```

- 测试文件命名：`<模块名>.test.ts`，与被测文件同名
- 测试结构：AAA（Arrange / Act / Assert），`describe` → `it` 两层
- `it` 描述格式：`输入条件 应该 期望结果`（中文）

### 常用命令

```bash
pnpm test            # 一次性运行全部单元测试
pnpm test:watch      # 监听模式（开发期间使用）
pnpm test:coverage   # 运行测试并生成覆盖率报告（coverage/）
```

### 覆盖率要求

| 模块 | 行覆盖率 ≥ |
|------|-----------|
| `src/utils/imageService.ts` | 85% |
| `src/utils/getNonce.ts` | 100% |
| `src/MarkdownDocument.ts` | 80% |
| `src/utils/contentTransform.ts` | 90% |
| `src/utils/lineMap.ts` | 90% |
| `webview/utils/slug.ts` | 90% |
| **整体** | 70% |

### 强制流程

**功能开发**：
1. 编写对应单元测试（核心逻辑、边界值、异常路径各至少一个用例）
2. 运行 `pnpm test`，全部通过
3. 运行 `pnpm build`，编译无误
4. 方可 `git commit`

**Bug 修复**：
1. 先补充**能复现该 bug 的测试用例**（写在修复同一 commit 内）
2. 确认该用例在修复前失败、修复后通过
3. 运行 `pnpm test`，全套通过后方可提交

**git push 前**：
- **必须**执行 `pnpm test`，全部通过才允许推送。CI 的 `unit-test` job 会在每次 push/PR 时自动运行（`.github/workflows/ci.yml`），失败则阻断构建。

### 禁止行为

- 禁止跳过（`it.skip`）或注释失败的测试用例来让 CI 通过
- 禁止修改测试预期值来掩盖 bug（除非实现有意变更且经过评审）
- 禁止在未运行测试的情况下 push 到 `main` 分支

### Mock 规范

- 每个 `describe` 块在 `beforeEach` 中调用 `vi.clearAllMocks()` 重置 mock 状态
- 文件系统操作统一 mock `vscode.workspace.fs`（禁止使用真实 fs 写磁盘）
- 依赖时间的逻辑使用 `vi.useFakeTimers()` / `vi.useRealTimers()`，禁止 `setTimeout` 真实等待
- 禁止测试 `private` 类方法，通过公共接口验证行为

## 提交变更

1. Fork 本仓库
2. 从 `dev` 分支创建新分支：`git checkout -b feature/your-feature`
3. 编写代码、测试，执行 `pnpm test` + `pnpm build` 验证
4. 向 **`dev`** 分支发起 Pull Request

> **说明：** `dev` 是活跃开发分支，`main` 是稳定发布分支——请勿向 `main` 发起 PR。

## 报告 Bug

请在 [GitHub Issue](https://github.com/peiyucn/epytor/issues/new) 中提交，附上 VS Code 版本号和 Output 面板（`EPYTOR` 频道）的相关日志。
