# 项目指令 — epytor

> **同步提醒**：修改此文件时，请同步更新 `CLAUDE.md`。

## 语言规范

* **始终用简体中文回复**

## 项目基本规则

* **包管理器**：必须用 `pnpm`，禁止 npm/yarn
* **构建**：修改代码后执行 `pnpm build` 验证编译无误
* **调试**：F5 启动扩展调试实例（`.vscode/launch.json`）
* **语言**：全部 TypeScript；Extension 端用 `tsconfig.json`，WebView 端用 `tsconfig.webview.json`
* **双目标构建**：`dist/extension.js`（Node.js）+ `dist/webview.js`（Browser），由 `esbuild.mjs` 完成
* **打包发布**：详见下方「文档与发布规范 → 发布流程」
* **Git commit 规范**：commit 描述部分必须用**中文**，类型前缀（`feat:`、`fix:`、`refactor:`、`chore:`、`docs:` 等）保留英文。例：`feat: 新增XXXX功能`、`fix: 修复XXXX问题`
* **诚实原则**：不确定的事直接说"不确定"，禁止编造 URL、issue 编号、API 接口、文档引用或任何事实性信息。如果引用外部资源，必须先验证其存在。
* **优雅原则**：禁止 hack 式或补丁式写法（如硬编码字符串映射表、MutationObserver 改 DOM、多层覆写对抗框架默认行为）。优先使用框架/库的官方 API、CSS 变量、配置回调等正路方案，保持代码简洁可维护。

***

## 关键文件速查

```
src/extension.ts                         — 扩展入口，注册 CustomEditorProvider
src/MarkdownEditorProvider.ts            — Provider 核心（消息路由、自动保存、revert）
src/utils/getNonce.ts                    — CSP nonce 生成
src/utils/imageService.ts               — 图片本地保存（MD5 去重）+ 服务器上传
src/i18n/webviewTranslations.ts         — WebView 翻译数据
webview/index.ts                         — WebView 入口（消息路由、DOM 事件委托、品牌标识注入）
webview/editor.ts                        — CrepeBuilder 入口（Milkdown 7.21.2 + Crepe 原生功能注册）
webview/messaging.ts                     — WebView ↔ Extension 消息协议（唯一通信层）
webview/style.css                        — VSCode 主题全覆盖（--vscode-* CSS 变量，覆盖 Crepe 组件）
webview/i18n/index.ts                    — t() / kbd() 翻译函数
webview/ui/icons.ts                      — SVG 图标
webview/ui/tooltip.ts                    — Tooltip 组件
webview/utils/themeBus.ts               — Mermaid/CodeMirror 深浅主题统一事件总线
webview/components/selectionToolbar/index.ts — 选区变更回调（驱动源码行号映射）
webview/components/toc/index.ts         — 目录（TOC）面板（吸底工具栏下方、可固定、可拖拽宽度）
webview/components/imageView/index.ts   — 图片 NodeView（选中/lightbox/工具栏/缩放 handle）
webview/components/findBar/index.ts     — 编辑器内查找栏（Cmd/Ctrl+F）
webview/components/pathLink/            — 路径链接自动补全
webview/headingIds.ts                    — 标题 id 管理（不操作 DOM，仅保留签名）
docs/specs/                              — 功能 spec 文档
docs/roadmap.md                          — 项目路线图
```

***

## 架构约束

* WebView ↔ Extension 通信**只通过** `webview/messaging.ts` 中封装的函数
* WebView 侧不直接 `import` VSCode API，通过 `acquireVsCodeApi()` 获取句柄
* CSS 必须使用 `--vscode-*` 变量以适配亮/暗主题
* 不在模块外部维护全局状态（单例除外，如 editor view）

***

## 文档与发布规范

### 文档角色

| 文件 | 用途 | 更新时机 |
|------|------|----------|
| `README.md` / `README.zh-CN.md` | 用户文档：功能介绍、安装方式、配置项、**已知限制** | 功能变更或发现新限制时 |
| `CHANGELOG.md` / `CHANGELOG.zh-CN.md` | 版本变更记录（[Keep a Changelog](https://keepachangelog.com/) 格式），**英文在前、中文在后** | **发布新版本时** |
| `docs/roadmap.md` | 路线图：**仅记录未来计划**，不写已发布的版本内容 | 规划新功能时 |

### 发布流程（必须严格按顺序）

1. **确认所有改动已提交到 `dev` 分支**
2. **更新 `CHANGELOG.md` 和 `CHANGELOG.zh-CN.md`**：新版本 section 放在文件最顶部
3. **更新 `package.json` 版本号**
4. **运行 `pnpm test` 确认全部通过**
5. **运行 `pnpm build` 确认编译无误**
6. **合并 `dev` → `main`**：`git checkout main && git merge dev`
7. **推送两个分支**：`git push origin dev main`
8. **打 tag 触发发布**：`git tag v<VERSION> && git push origin v<VERSION>`
   - CI（`.github/workflows/release.yml`）将自动打包 VSIX 并发布到 VS Code Marketplace
   - 同时自动创建 GitHub Release
9. **切回 `dev`**：`git checkout dev`

> **注意**：步骤 8 由 GitHub Actions 自动完成打包和发布，无需手动执行 `pnpm run package`。

### Issue 管理

* **已知 Bug**：加 `bug` + `known-limitation` label，仅记录开发完成后仍未修复的问题
* **功能需求**：加 `enhancement` + `roadmap` label，记录计划功能
* 触发方式：用户说"记录 bug"、"记录需求"、"功能需求"
* 若阶段进度有变化，同步更新 `docs/roadmap.md`

***

## 测试规范

### 技术栈

| 层次 | 框架 | 适用范围 |
| :------------- | :-------------------------------- | :-------------------------------------- |
| Extension 单元测试 | **Vitest 2.x**（Node 环境） | `src/utils/`、`src/MarkdownDocument.ts` |
| WebView 单元测试 | **Vitest 2.x + jsdom 24.x** | `webview/utils/`、`webview/messaging.ts` |
| 集成测试（计划中） | **@vscode/test-electron + Mocha** | 需真实 VSCode Extension Host |

`vscode` 模块通过 `__mocks__/vscode.ts` 统一 mock，由 `vitest.config.ts` 的 `resolve.alias` 注入，禁止在单个测试文件中 `vi.mock("vscode")`。

### 测试命令

```bash
pnpm test              # 一次性运行全部单元测试
pnpm test:watch        # 监听模式（开发期间使用）
pnpm test:coverage     # 运行测试并生成覆盖率报告（coverage/）
```

### 目录与命名规范

```
src/__tests__/           — Extension 侧单元测试（Node 环境）
webview/__tests__/       — WebView 侧单元测试（jsdom 环境）
webview/__tests__/setup.ts  — jsdom 全局 setup（注入 acquireVsCodeApi）
shared/__tests__/        — 共享类型测试
__mocks__/vscode.ts      — vscode API 统一 mock
```

* 测试文件命名：`<模块名>.test.ts`，与被测文件同名
* 测试结构遵循 **AAA 原则**（Arrange / Act / Assert），`describe` → `it` 两层
* `it` 描述格式：`输入条件 应该 期望结果`（中文）

### 覆盖率要求

| 模块 | 行覆盖率下限 |
| :------------------------------ | :----- |
| `src/utils/imageService.ts` | ≥ 85% |
| `src/utils/getNonce.ts` | 100% |
| `src/MarkdownDocument.ts` | ≥ 80% |
| `src/utils/contentTransform.ts` | ≥ 90% |
| `src/utils/lineMap.ts` | ≥ 90% |
| `webview/utils/slug.ts` | ≥ 90% |
| **整体** | ≥ 70% |

### 强制流程

#### 功能开发后

1. 编写对应单元测试（核心逻辑、边界值、异常路径各至少一个用例）
2. 运行 `pnpm test` 确认全部通过
3. 运行 `pnpm build` 确认编译无误
4. 方可 `git commit`

#### Bug 修复后

1. 先补充**能复现该 bug 的测试用例**（写在修复同一 commit 内）
2. 确认该用例在修复前失败、修复后通过
3. 运行 `pnpm test` 确认全套通过后方可提交

#### git push 前

* **必须**执行 `pnpm test`，全部通过才允许推送
* CI 的 `unit-test` job 会在每次 push/PR 时自动运行（`.github/workflows/ci.yml`），失败则阻断构建

### 测试失败处理流程

```
测试失败
  │
  ├─ 是新引入的失败？→ 定位代码变更，修复后重新运行
  │
  ├─ 是测试预期不符实现（实现已有意变更）？→ 同步更新测试
  │
  └─ 是环境/依赖问题？→ 检查 jsdom 版本、vscode mock 是否完整
```

**禁止行为**：

* 禁止跳过（`it.skip`）或注释失败的测试用例来让 CI 通过
* 禁止修改测试预期值来掩盖 bug（除非实现有意变更且经过评审）
* 禁止在未运行测试的情况下 push 到 `main` 或 `dev` 分支

### Mock 规范

* 每个 `describe` 块在 `beforeEach` 中调用 `vi.clearAllMocks()` 重置 mock 状态
* 文件系统操作统一 mock `vscode.workspace.fs`（禁止使用真实 fs 写磁盘）
* 依赖时间的逻辑使用 `vi.useFakeTimers()` / `vi.useRealTimers()`，禁止 `setTimeout` 真实等待
* 禁止测试 `private` 类方法，通过公共接口验证行为

***

## 自动保存设置

| 设置项                             | 类型      | 默认值    | 说明       |
| :--------------------- | :------ | :----- | :------- |
| `epytor.autoSave`      | boolean | `true` | 编辑后自动写盘  |
| `epytor.autoSaveDelay` | number  | `1000` | 防抖延迟（ms） |

