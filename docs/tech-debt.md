# 技术债务

> 面向开发者的代码质量改进清单，不涉及用户可见功能变更。
> **最后更新：2026-10-18**（本轮：保存保真「四条 → 三条」复测、表格 `<br>` 链改为「可拆」、数量/行号引用刷新；已清偿只留结论，细节在对应 commit / `docs/audits/`）。

***

## 待处理

### 🔴 高优先级（影响面大，独立处理）

（无待处理项）

### 🟡 中优先级（每次改一点）

* [ ] **表格 `<br>` 往返闭环（四层）——已确认可拆（2026-10-18）** — 上游 [Milkdown#2463](https://github.com/Milkdown/milkdown/issues/2463) 已随 7.22.2 修复、7.22.3 复验全绿（`tableBrRoundtrip` / `tableSoftBreak` / `saveFidelity`），四层 workaround 现在纯冗余：`convertTableBrForDisplay`（`src/utils/contentTransform.ts`）+ `withTableBreakHandler` / `cleanTableBreaks` / `preserveTableBreakStyle`（`webview/utils/markdownSerializer.ts`）。拆链注意：① 先补/保留「表格内手写 `<br>` 保存往返」用例再删代码；② 别把 `tableWrapMode`（换行两档，用户配置）一起拆掉；③ 关联用例保留作保护，拆完移入「已清偿」
* [ ] **保存保真：剩余三条「编辑后改写用户原文」**（2026-10-18 复测）— 「未编辑保存被改写」已由 v1.2.5 的 doc 快照快路径保证逐字；以下三条只在**编辑过文档后**触发：
  * **① 混合标记符文件被拆成多个列表并插入空行**：`- a\n* b\n- c` 改一行后存成 `- a!\n\n* b\n\n- c`（remark 把标记符变化当成新列表、mdast 在相邻块之间补空行；单一标记符的文件不受影响）
  * **② `~x~` 被写成 `~~x~~`**：`H~2~O` 编辑后存成 `H~~2~~O` —— remark-gfm 的 `singleTilde` 默认 true；按 GFM 规范可在 `remarkGFMPlugin.options` 关掉（会给文件加新语义，需定口径）
  * **③ GitHub 提示块被转义**：`> [!NOTE]` 编辑后存成 `> \[!NOTE\]`，GitHub 上不再渲染
  * ②③ 涉及 clean 模式放宽转义的边界（放宽会引入 `[` / `~` 的结构歧义风险），处理口径需 owner 定
* [ ] **锚点链接不做 slug 归一化**（2026-09-17 登记）— 编辑器给标题挂的 id 是**标题原文**（`## Hello World!` → `id="hello-world!"`，重名追加 `-#2`），而链接里常见 GitHub 风格 slug（`#hello-world`）。`webview/utils/anchorTarget.ts` 只处理**编码差异**（原文 → 整串解码），**不猜 slug**——猜错会跳到**别的标题**，比「点了没反应」更糟。待定口径：支不支持 slug / 按哪套规则 / 重名如何编号；定了再实现并补测试
* [ ] **代码块全屏按钮注入** — MutationObserver 改为 Crepe NodeView 扩展（现：`webview/components/codeBlockEnhance/index.ts` + `webview/index.ts` 的 scanBlocks）
* [ ] **CodeMirror 主题补配** — MutationObserver 改为 Compartment 初始化时传入（现：`webview/utils/cmThemeObserver.ts`）
* [ ] **溢出菜单与官方 Vue 渲染的耦合点** — ① 隐藏 class 依赖 MutationObserver 自愈（Vue patch 覆盖）② 按钮 meta 与官方 DOM 渲染顺序对齐（现：`webview/components/topBarOverflow/index.ts`、`webview/components/topBar/topBarDecorations.ts`）；上游 topBar 提供 item key 或 overflow 能力后移除
* [ ] **index.ts 剩余职责**（当前 1013 行）— 图片请求编排 / 滚动持久化 / 链接行为仍在入口文件，可再提 `linkBehavior` / `scrollPersistence` 模块
* [ ] **折叠光标进出防护**（需手测确认）— 折叠后方向键能否把光标移入 `display:none` 的隐藏块并不可见输入，jsdom 无法验证；实测可达则补方向键拦截
* [ ] **非激活面板的保存不拉取（`_panelActive` 闸门）** — 保活下非激活面板其实还活着、多半能回包，但 `_requestContent` 仍按保守口径短路（用 `_pushedContent` 最陈旧 400ms 或扩展内存内容落盘）。**owner 真机手测（2026-09-13）：停手后立刻切标签，最后一次改动仍写进了文件，「400ms 窗口」未复现**——路径上存在理论窗口、真机上未被观测到。放开闸门能否更稳仍需真机验证：切标签 → 等自动保存 → 核对文件与 webview 一致；未验证前不改行为（回归 a4349cc 曾报「编辑器无响应」）

***

## 已清偿

> 只留结论与去向；细节在对应 commit / `docs/audits/`，不再逐一复述。

* [x] **保存保真 ④：以列表/表格结尾的文档，编辑后不再多末尾空行**（2026-10-18 复测；7.22.3 升级后消失）
* [x] 折叠期守卫真机复测 + 保活架构定案（2026-09-11；读数见 `docs/audits/2026-09-11-tab-switch-flicker-measurement.md`；提交 `3aebc39` / `4b21977` / `a651345`）
* [x] 顶栏溢出 resize 监听器未释放（2026-09-11；有回归测试）
* [x] 2026-09-08 全面审计修复 33 项（详见 `docs/audits/2026-09-08-full-code-audit.md`）
* [x] `resolveCustomEditor` / `setupSelectionToolbar` / `initToc` / `createImageView` 拆分（2026-09-05）
* [x] selectionToolbar 死代码整体删除（2026-09-04，-1025 行）
* [x] 魔法数字常量化 → `shared/constants.ts`（25 常量 / ~55 处）
* [x] `buildTopBar` 类型安全与拆分（8 处 `any` 清零）
* [x] 下拉补全重复 → `ui/pathCompleteCore.ts` + `utils/pathSuggestionRequests.ts`（请求生命周期统一注册表）
* [x] 确认/取消编辑重复 → `startToolbarInlineEdit`（`components/imageView`）
* [x] 顶栏 P 下拉被 `overflow:hidden` 裁剪 → `overflow: visible` + CSS 回归测试
* [x] 12 处空 catch 补注释
* [x] 真实 300×150 被误判为宿主折叠 → 基于用户输入区分（`data-epytor-tiny-real`）
* [x] **配置面收敛：14 → 7 项**（`tableWrapMode` / `codeBlockMaxHeight` / `editorMaxWidth` / `serializationMode` / `imageStorage` / `imageLocalPath` / `imageServer`；4 个弃用旧键仅兜底、带 `deprecationMessage`；分组与 nls 见 `package.json`）
* [x] 测试补齐：`themeBus.ts` / `i18n/index.ts` / `MarkdownDocument.ts` / `imageService.ts` 的边界与覆盖率

***

## 暂缓处理

以下项目已识别但当前不紧急，择机处理。

### 🔴 上游 workaround

* [ ] **切标签「整块闪一下」= 宿主行为，扩展侧抑制已到顶**（2026-09-12 定案）— 平台行为、接受；实验读数与「不采用销毁路线」的理由见 `docs/upstream-limits.md` 第 4 项与 `docs/audits/2026-09-11-tab-switch-flicker-measurement.md`。撤销历史快照实现保留在 `858518a`
* [ ] **`cellClickFixPlugin`**（`webview/editor.ts` 内 ~130 行，配合 `webview/utils/cellClickState.ts`）— `filterTransaction` + `appendTransaction` + `requestAnimationFrame` 多层拦截，对抗 Crepe 表格单击行为不稳定。**需等上游 [Milkdown#2414](https://github.com/Milkdown/milkdown/issues/2414) 修复后移除**（2026-10-18 复核：仍 open）
* [ ] **vendor latex feature 上游同步**（`webview/vendor/latexFeature.ts`）— 升级 `@milkdown/crepe` 时按文件头「§上游对照」逐节 diff 上游 `src/feature/latex/*`；若上游 latex feature 改为惰性加载 katex，可移除本 vendor 与 `esbuild.mjs` 的 katex-stub-for-crepe。**2026-10-18 升 7.22.3 复核：该版本无 latex feature 改动（未触发同步），上游 open PR #2497（`$5` 误判行内公式）合并后再评估**

### 🔴 官方无替代（已查证）

* [ ] **顶栏 button tooltip 注入**（`webview/components/topBar/topBarDecorations.ts`，MutationObserver 扫描）— **2026-10-18 复核 7.22.3：官方 `TopBarItem` 仍只有 `{ active, icon, selector? }`，无文案字段**；MutationObserver 注入是唯一可行手段（上游提供文案字段后移除）

### 🟠 DOM 刮削 / MutationObserver 反模式（剩余）

* [ ] **语言列表键盘导航**（`webview/components/codeBlockEnhance/index.ts`，操作 `.language-list-item` 内部 DOM）— 影响面小，暂缓

### 🟡 类型安全（剩余）

* [ ] **142 处 `!important`**（`webview/style.css`；2026-10-18 复核：文档原记 119，已增长）— 量大，需逐个分析替代方案

### 🟢 脆弱事件处理

* [ ] **`capture` 阶段事件监听（9 处：8 处 `addEventListener(..., true)` + 1 处 `{ capture: true }`，2026-10-18 复核：文档原记 5）** — Milkdown 短期不会大改事件机制，暂不处理
* [ ] **链接点击 `stopImmediatePropagation`**（`webview/index.ts`）— 运行稳定，暂不处理

### 工具链

* [ ] **集成测试**：`@vscode/test-electron + Mocha` 未搭建（2026-10-18 复核：依赖仍未加）— 主要覆盖 `extension.ts` + `MarkdownEditorProvider.ts`，单测无法触及的 wiring 逻辑
