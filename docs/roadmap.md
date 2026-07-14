# EPYTOR 路线图

> 最后更新：2026-07-08

***

## v1.1.x 🚀

### 架构升级

* [x] Milkdown 7.5.x → 7.21.2 + Crepe
* [x] Prism → CodeMirror 6
* [x] 表格 / 链接 / 工具栏迁移至 Crepe 原生实现
* [x] Claude 集成移除

### 新功能

* [x] LaTeX 数学公式、图片缩放与 Caption、图片选择器、图片加载重试
* [x] 工具栏毛玻璃吸顶 + 品牌标识、Undo/Redo/清除格式/设置按钮
* [x] Mermaid 深浅主题、TOC 面板优化、编辑器上边距 52px
* [x] H1-H6 标题样式打磨：h1 字重 700、h4 1.15em、h6 字重 400 + 灰色

### 待修复 Bug

* [x] **清除格式不彻底** — `clear-format` 按钮只清粗体/斜体/删除线/行内代码，需验证链接是否也能清除；定位：[editor.ts:616-639](../webview/editor.ts#L616)
* [x] **TOC 点击定位不准** — `domAtPos(pos + 1)` 在标题有行内格式时可能找不到 `<h1>`-`<h6>` 元素，改用 `view.nodeDOM(pos)`；定位：[toc/index.ts:238-268](../webview/components/toc/index.ts#L238)

### 待完成功能

* [x] **引用块一键退出** — blockquote 工具栏按钮改为 toggle：在引用内点击 → `lift` 解包退出，不在引用内 → 包裹。不支持嵌套引用；定位：[editor.ts](../webview/editor.ts) blockquote 按钮 onRun/active
* [x] **源代码/渲染切换行定位改进** — 当前 `computeLineMap` 段落粒度导致段内行无法定位。方案：`scrollToSourceLine` 中按段内行数做比例插值滚动；定位：[lineMap.ts](../src/utils/lineMap.ts)、[index.ts:72-86](../webview/index.ts#L72)

### 待优化

* [x] **窄窗口工具栏换行** — 窗口较窄时工具栏 `flex-wrap: nowrap` 导致按钮不换行，与 "EPYTOR🦖" logo 重叠。改为限定最小宽度阈值，低于阈值时 `flex-wrap: wrap` + 自动增高；定位：[style.css:574-591](../webview/style.css#L574)、品牌标识 [style.css:560-572](../webview/style.css#L560)

### 设计决策

* 行定位方案：段内比例插值（方案 A），不改 `computeLineMap` 格式，改动最小
* 引用回退：用 ProseMirror 原生 `lift` 命令解包，需从 `prosemirror-commands` 导入

### 技术债务

#### 🔴 上游 workaround

* [ ] **`cellClickFixPlugin`**（\~130 行，[editor.ts:236-363](../webview/editor.ts#L236)）— `filterTransaction` + `appendTransaction` + `requestAnimationFrame` 多层拦截，对抗 Crepe 表格单击行为不稳定。**需等 Milkdown 上游修复后移除。**

#### 🟠 DOM 刮削 / MutationObserver 反模式

* [ ] **顶栏按钮 tooltip 注入**（[index.ts:638-678](../webview/index.ts#L638)）— MutationObserver + `requestAnimationFrame` 扫描 `.top-bar-item` 挂 tooltip。应改用 Crepe `buildTopBar` 配置或 CSS `::after`。
* [ ] **代码块全屏按钮注入**（[index.ts:594-599](../webview/index.ts#L594)）— MutationObserver 扫描 `.milkdown-code-block` 插入按钮。应改用 Crepe NodeView 扩展。
* [x] **~~语言搜索 i18n~~** → 已通过 `searchPlaceholder` 配置传入，MutationObserver 已移除。
* [ ] **CodeMirror 主题补配**（[editor.ts:541-545](../webview/editor.ts#L541)）— MutationObserver 监听 DOM 创建后重配主题。应通过 CodeMirror Compartment 初始化时传入。
* [ ] **语言列表键盘导航**（[index.ts:608-635](../webview/index.ts#L608)）— 操作 `.language-list-item` 内部 DOM。应通过 Crepe code-mirror 配置或 API 实现。

#### 🟡 类型安全

* [ ] **`buildTopBar`** **按钮配置** **`as any`**（14 处，[editor.ts:606-661](../webview/editor.ts#L606)）— Crepe 自定义按钮类型定义不完整，等待上游补类型或自己写 augment。
* [ ] **119 处** **`!important`**（[style.css](../webview/style.css)）— 大量规则对抗 Crepe 默认样式。应逐步用 CSS 变量和更高特异性选择器替代。

#### 🟢 脆弱事件处理

* [ ] **`capture: true`** **事件监听**（5 处）— 依赖捕获阶段抢占 Crepe handler，升级 Crepe 可能失效。
* [ ] **链接点击** **`stopImmediatePropagation`**（[index.ts:371](../webview/index.ts#L371)）— 阻止 Crepe 默认跳转行为，脆弱。

### 代码整洁

* [x] **图标已统一**：`editor.ts`/`index.ts` 行内 SVG 已迁移至 `icons.ts`（`Tb*` 工具栏格式 + `IconMaximize2`）。
* [ ] **巨型函数拆分**：`setupSelectionToolbar`（553 行）、`createImageView`（498 行）、`initToc`（392 行）、`resolveCustomEditor`（318 行）— 应拆为小函数或独立模块。
* [ ] **下拉补全重复**：`pathComplete`、`imgPathComplete`、`imagePicker` 各自实现相同结构的下拉菜单，应提取 `createDropdown()` 到 `ui/dom.ts`。
* [ ] **确认/取消编辑重复**：`imageView` 中 `startCaptionEdit` 和 `startSrcEdit` 80% 代码相同，应提取通用内联编辑模式。
* [ ] **hover 弹出菜单重复**：`selectionToolbar` 格式下拉和对齐下拉结构一样，应提取 `createHoverMenu()` 到 `ui/dom.ts`。
* [ ] **魔法数字**：顶栏高度 `36`/`40` 混用，滚动偏移 `8` 散落 7 处，CSS 选择器 `.milkdown-top-bar` 出现 10+ 次——应定义常量。
* [ ] **空 catch 块**：12 处静默吞错误，至少应 `console.warn`。

### 工具链

* [ ] **单元测试**：`webview/utils/themeBus.ts` 覆盖率 0%，需补齐。
* [ ] **共享类型测试**：`shared/__tests__/` 目录不存在（CLAUDE.md 要求）。
* [ ] **集成测试**：`@vscode/test-electron + Mocha` 未搭建（CLAUDE.md 标注"计划中"）。
* [ ] **Spec skill**：创建 `.claude/skills/spec/` — 管理 spec 文档生命周期。

