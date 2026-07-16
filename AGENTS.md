# 项目指令 — epytor

## 语言

* **始终用简体中文回复**

***

## 需求

* 新功能设计文档放在 `docs/specs/`，文件名 `YYYY-MM-DD-<功能名>.md`
* 先写 spec 再开发——明确需求范围、交互边界、验收标准
* 配置项参考见[开发 → 配置参考](#配置参考)

***

## 开发

### 基本规则

* **包管理器**：必须用 `pnpm`，禁止 npm/yarn
* **构建**：修改代码后执行 `pnpm build` 验证编译无误
* **调试**：F5 启动扩展调试实例（`.vscode/launch.json`）
* **语言**：全部 TypeScript；Extension 端用 `tsconfig.json`，WebView 端用 `tsconfig.webview.json`
* **双目标构建**：`dist/extension.js`（Node.js）+ `dist/webview.js`（Browser），由 `esbuild.mjs` 完成
* **Git commit 规范**：commit 描述用**中文**，类型前缀保留英文（`feat:`、`fix:`、`refactor:`、`chore:`、`docs:` 等）。例：`feat: 新增XXXX功能`、`fix: 修复XXXX问题`
* **诚实原则**：不确定的事直接说"不确定"，禁止编造 URL、issue 编号、API 接口、文档引用或任何事实性信息
* **优雅原则**：禁止 hack 或补丁式写法，优先使用框架/库官方 API、CSS 变量、配置回调等正路方案

### 架构约束

* WebView ↔ Extension 通信**只通过** `webview/messaging.ts` 中封装的函数
* WebView 侧不直接 `import` VSCode API，通过 `acquireVsCodeApi()` 获取句柄
* CSS 必须使用 `--vscode-*` 变量以适配亮/暗主题
* 不在模块外部维护全局状态（单例除外，如 editor view）

### 关键文件速查

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

### 配置参考

| 设置项 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `epytor.autoSave` | boolean | `true` | 编辑后自动写盘 |
| `epytor.autoSaveDelay` | number | `1000` | 防抖延迟（ms） |

***

## 测试

### 技术栈

| 层次 | 框架 | 适用范围 |
| :--- | :--- | :--- |
| Extension 单元测试 | **Vitest 2.x**（Node 环境） | `src/utils/`、`src/MarkdownDocument.ts` |
| WebView 单元测试 | **Vitest 2.x + jsdom 24.x** | `webview/utils/`、`webview/messaging.ts` |
| 集成测试（计划中） | **@vscode/test-electron + Mocha** | 需真实 VSCode Extension Host |

`vscode` 模块通过 `__mocks__/vscode.ts` 统一 mock，由 `vitest.config.ts` 的 `resolve.alias` 注入，禁止在单个测试文件中 `vi.mock("vscode")`。

### 命令

```bash
pnpm test              # 一次性运行全部单元测试
pnpm test:watch        # 监听模式（开发期间使用）
pnpm test:coverage     # 运行测试并生成覆盖率报告（coverage/）
```

### 目录与命名

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
| :--- | :--- |
| `src/utils/imageService.ts` | ≥ 85% |
| `src/utils/getNonce.ts` | 100% |
| `src/MarkdownDocument.ts` | ≥ 80% |
| `src/utils/contentTransform.ts` | ≥ 90% |
| `src/utils/lineMap.ts` | ≥ 90% |
| `webview/utils/slug.ts` | ≥ 90% |
| **整体** | ≥ 70% |

### 强制流程

**功能开发后**：

1. 编写对应单元测试（核心逻辑、边界值、异常路径各至少一个用例）
2. 运行 `pnpm test` 确认全部通过
3. 运行 `pnpm build` 确认编译无误
4. 方可 `git commit`

**Bug 修复后**：

1. 先补充**能复现该 bug 的测试用例**（写在修复同一 commit 内）
2. 确认该用例在修复前失败、修复后通过
3. 运行 `pnpm test` 确认全套通过后方可提交

**git push 前**：

* **必须**执行 `pnpm test`，全部通过才允许推送

### 测试失败处理

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

### CI 自动化

每次 push/PR 到 `main`/`dev` 自动运行测试 + 覆盖率检查 + 构建验证，配置见 `.github/workflows/ci.yml`。

***

## 发布

### 文档角色

| 文件 | 用途 | 更新时机 |
| :--- | :--- | :--- |
| `README.md` / `README.zh-CN.md` | 用户文档：功能介绍、安装方式、配置项、**已知限制** | 功能变更或发现新限制时 |
| `CONTRIBUTING.md` / `CONTRIBUTING.zh-CN.md` | 贡献指南：开发环境、提交流程、Bug 报告 | 开发流程或分支策略变更时 |
| `CHANGELOG.md` / `CHANGELOG.zh-CN.md` | 版本变更记录（[Keep a Changelog](https://keepachangelog.com/) 格式），**英文在前、中文在后** | **发布新版本时** |

### 发布流程（必须严格按顺序）

**阶段一：内容确认**（编辑前）

执行任何编辑操作前，必须将以下内容逐项展示给用户确认：

1. `README.md` + `README.zh-CN.md` 是否有本次发布相关的改动
2. `CHANGELOG.md` + `CHANGELOG.zh-CN.md` 新版本 section 的完整内容
3. `docs/roadmap.md` 是否有条目需要标记完成或调整
4. `package.json` 版本号
5. 合并 commit message
6. Tag annotation 内容

---

**阶段二：编辑 & 验证**

1. **确认所有改动已提交到 `dev` 分支**
2. **更新 `CHANGELOG.md` 和 `CHANGELOG.zh-CN.md`**：新版本 section 放在文件最顶部
3. **更新 `package.json` 版本号**
4. **运行 `pnpm test` 确认全部通过**
5. **运行 `pnpm build` 确认编译无误**

---

**阶段三：最终确认**（编辑后、发布前）

所有编辑完成后，**再次将实际改动展示给用户确认**（CHANGELOG diff、版本号、commit message、tag annotation），用户确认后方可继续。

---

**阶段四：发布**

6. **合并 `dev` → `main`**：`git checkout main && git merge dev --no-ff -m "chore: 合并 dev → main，发布 v<VERSION>"`
7. **推送两个分支**：`git push origin dev main`
8. **打 tag 触发发布**：`git tag -a v<VERSION> -m "v<VERSION>: <简述>" && git push origin v<VERSION>`
9. **切回 `dev`**：`git checkout dev`

### CI 自动化

推送 `v*.*.*` tag 后自动打包 VSIX、发布到 VS Code Marketplace、创建 GitHub Release，配置见 `.github/workflows/release.yml`。

***

## Issue 管理

### 标签体系

| 标签 | 用途 |
| :--- | :--- |
| `bug` | 已确认的 bug |
| `bug` + `known-limitation` | 已知限制（开发完成后仍未修复的问题） |
| `enhancement` + `roadmap` | 计划功能（处于路线图中） |
| `enhancement` | 其他功能改进 |

### 与路线联动

* Issue 状态变化影响路线时，同步更新 `docs/roadmap.md`
* 路线图中的条目如有对应 Issue，在 roadmap 中标注 issue 编号

### 模板

Issue 使用 `.yml` Issue Forms（结构化表单），模板文件见 `.github/ISSUE_TEMPLATE/`：

| 模板 | 文件 | 自动标签 |
|------|------|----------|
| Bug 报告 | `bug_report.yml` | `bug` |
| 功能需求 | `feature_request.yml` | `enhancement` |

- `blank_issues_enabled: false`（`config.yml`），强制使用模板，不允许空白 issue
- 标签由模板 `labels:` 字段自动设置，用户无需手动选择
- 非 Bug/功能的讨论引导至 [Discussions](https://github.com/peiyucn/epytor/discussions)

***

## 路线

项目路线图见 `docs/roadmap.md`，**仅记录未来计划**，不写已发布的版本内容。

规划新功能或阶段进度有变化时同步更新。

***

## 上游限制

以下限制来自 Milkdown / Crepe / ProseMirror 等上游依赖，EPYTOR 无法自行修复。升级上游依赖时需逐项验证是否已解决。

| # | 限制 | 来源 | 追踪 |
|---|------|------|------|
| 1 | 行内样式（粗体、斜体、行内代码等）尾部无后续内容时无法退出 | Milkdown | [Milkdown#2413](https://github.com/Milkdown/milkdown/issues/2413) |
| 2 | 有序列表多层级编号均为十进制（不区分 a.b.c. / i.ii.iii.） | Milkdown 内核 | [Milkdown#2415](https://github.com/Milkdown/milkdown/issues/2415) |
| 3 | 表格单击选中整格暂时关闭 | Crepe | [Milkdown#2414](https://github.com/Milkdown/milkdown/issues/2414) |

**维护规则**：
* 发现新的上游限制时追加到此表，同时在各 `README` 已知限制中标记 `⚠️ 上游` / `⚠️ Upstream`
* 升级依赖版本时对照此表逐项验证，已解决的条目从表中移除，写入 CHANGELOG 的 Fixed
* 优先在对应上游仓库提 issue，将链接填入"追踪"列
* **向上游提 issue 时必须遵循对方模板规范**：标题带 `[Bug]` 或 `[Feature]` 前缀，正文结构化（复现步骤 / 期望行为 / 实际行为 / 运行环境）。若对方使用 `.yml` Issue Forms，`gh issue create` CLI 无法触发模板校验，需手动对齐模板要求的字段

***

## Devlog

开发过程中发现 bug 或有功能想法时，通过 `/devlog` 技能记录为 GitHub Issue。

* **触发词**：`记录 bug`、`已知 bug`、`功能需求`、`记录需求`、`/devlog`
* **行为**：自动创建 GitHub Issue 并添加对应 label（bug → `bug`，功能 → `enhancement`）
* **时机**：开发过程中随时记录，不必等到阶段结束

