# EPYTOR 路线图

> 最后更新：2026-06-19

---

## v1.1.0 — 当前版本

### 架构升级
- [x] Milkdown 7.5.x → 7.21.2 + Crepe
- [x] Prism → CodeMirror 6
- [x] 表格 / 链接 / 工具栏迁移至 Crepe 原生实现
- [x] Claude 集成移除

### 新功能
- [x] LaTeX 数学公式、图片缩放与 Caption、图片选择器、图片加载重试
- [x] 工具栏毛玻璃吸顶 + 品牌标识、Undo/Redo/清除格式/设置按钮
- [x] Mermaid 深浅主题、TOC 面板优化、编辑器上边距 52px

### 技术债务

#### 🔴 上游 workaround
- [ ] **`cellClickFixPlugin`**（~130 行，[editor.ts:236-363](../webview/editor.ts#L236)）— `filterTransaction` + `appendTransaction` + `requestAnimationFrame` 多层拦截，对抗 Crepe 表格单击行为不稳定。**需等 Milkdown 上游修复后移除。**

#### 🟠 DOM 刮削 / MutationObserver 反模式
- [ ] **顶栏按钮 tooltip 注入**（[index.ts:638-678](../webview/index.ts#L638)）— MutationObserver + `requestAnimationFrame` 扫描 `.top-bar-item` 挂 tooltip。应改用 Crepe `buildTopBar` 配置或 CSS `::after`。
- [ ] **代码块全屏按钮注入**（[index.ts:594-599](../webview/index.ts#L594)）— MutationObserver 扫描 `.milkdown-code-block` 插入按钮。应改用 Crepe NodeView 扩展。
- [x] ~~**语言搜索 i18n**~~ → 已通过 `searchPlaceholder` 配置传入，MutationObserver 已移除。
- [ ] **CodeMirror 主题补配**（[editor.ts:541-545](../webview/editor.ts#L541)）— MutationObserver 监听 DOM 创建后重配主题。应通过 CodeMirror Compartment 初始化时传入。
- [ ] **语言列表键盘导航**（[index.ts:608-635](../webview/index.ts#L608)）— 操作 `.language-list-item` 内部 DOM。应通过 Crepe code-mirror 配置或 API 实现。

#### 🟡 类型安全
- [ ] **`buildTopBar` 按钮配置 `as any`**（14 处，[editor.ts:606-661](../webview/editor.ts#L606)）— Crepe 自定义按钮类型定义不完整，等待上游补类型或自己写 augment。
- [ ] **119 处 `!important`**（[style.css](../webview/style.css)）— 大量规则对抗 Crepe 默认样式。应逐步用 CSS 变量和更高特异性选择器替代。

#### 🟢 脆弱事件处理
- [ ] **`capture: true` 事件监听**（5 处）— 依赖捕获阶段抢占 Crepe handler，升级 Crepe 可能失效。
- [ ] **链接点击 `stopImmediatePropagation`**（[index.ts:371](../webview/index.ts#L371)）— 阻止 Crepe 默认跳转行为，脆弱。

### 工具链

- [ ] **单元测试**：`webview/utils/themeBus.ts` 覆盖率 0%，需补齐。
- [ ] **共享类型测试**：`shared/__tests__/` 目录不存在（CLAUDE.md 要求）。
- [ ] **集成测试**：`@vscode/test-electron + Mocha` 未搭建（CLAUDE.md 标注"计划中"）。
- [ ] **Spec skill**：创建 `.claude/skills/spec/` — 管理 spec 文档生命周期。
- [ ] **工程 skill**：创建 `.claude/skills/vibe/` — 结构化 AI 辅助迭代流程。

