# 技术债务

> 面向开发者的代码质量改进清单，不涉及用户可见功能变更。
> **最后更新：2026-10-31**（本轮：三个巨型单元拆分完成 + F10/F11/F4 收口 + 9 条遗留缺陷修复 + 覆盖率 54.8%→73.75%；行为变更逐条见 CHANGELOG）。
> 已清偿只留结论，细节在对应 commit / `docs/audits/`。本轮完整报告见 [`audits/2026-10-31-refactor-final.md`](audits/2026-10-31-refactor-final.md)。

***

## 待处理

### 🔴 高优先级（影响面大，独立处理）

（无待处理项。上一轮的三条高优先级——保存竞态、per-uri 状态清理、覆盖率门禁口径——均已清偿，见文末。）

### 🟡 中优先级（每次改一点）

* [ ] **`style.css` 的 `!important` 清理** — 全仓 13 个 CSS 文件合计 158 处（`webview/style.css` 89 处；2026-10-31 实测）。7 条 `fill: … !important` 与若干 `!important` 仍在。**注意**：实测顶栏图标 computed `fill=none`，说明部分规则**根本没匹配**（`.milkdown-top-bar` 可能不在 `.milkdown` 根内），先确认匹配关系再删。**需要真机视觉核对**，本轮未做。
* [ ] **集成测试** — `@vscode/test-electron + Mocha` 仍未搭建（依赖未加）。主要覆盖 `extension.ts` 的激活/命令注册与 Provider 在**真实 Extension Host** 里的 wiring；单测 + headless smoke 覆盖不到的剩余部分。属于「补齐测试基建」，不是重构尾巴。
* [ ] **入口 `webview/index.ts` 无直接单测** — 508 行入口是 DOM 脚手架 + 消息路由，jsdom 化成本高、价值低于直测已抽出的模块。当前由 `webview/app/*`、`webview/editor/*` 单测 + `pnpm run smoke`（真实 Edge 跑生产 bundle，14 项）间接覆盖；若日后要改入口生命周期/监听顺序，优先扩 smoke 断言而不是硬套 jsdom。

### 🟢 需要 owner 拍板 / 真机验证（不阻塞重构完成）

* [ ] **保存保真：剩余三条「编辑后改写用户原文」**（2026-10-18 复测；2026-10-26 复核仍存在）— 「未编辑保存被改写」已由 v1.2.5 的 doc 快照快路径保证逐字；以下三条只在**编辑过文档后**触发：
  * **① 混合标记符文件被拆成多个列表并插入空行**：`- a\n* b\n- c` 改一行后存成 `- a!\n\n* b\n\n- c`（remark 把标记符变化当成新列表、mdast 在相邻块之间补空行）
  * **② `~x~` 被写成 `~~x~~`**：`H~2~O` 编辑后存成 `H~~2~~O` —— remark-gfm 的 `singleTilde` 默认 true；关掉会给文件加新语义，需定口径
  * **③ GitHub 提示块被转义**：`> [!NOTE]` 编辑后存成 `> \[!NOTE\]`
  * ②③ 涉及 clean 模式放宽转义的边界（放宽会引入 `[` / `~` 的结构歧义风险），处理口径需 owner 定
* [ ] **锚点链接不做 slug 归一化**（2026-09-17 登记）— 编辑器给标题挂的 id 是**标题原文**（`## Hello World!` → `id="hello-world!"`，重名追加 `-#2`），而链接里常见 GitHub 风格 slug（`#hello-world`）。`webview/shell/anchorTarget.ts` 只处理**编码差异**（原文 → 整串解码），**不猜 slug**——猜错会跳到**别的标题**。待定口径：支不支持 slug / 按哪套规则 / 重名如何编号。
* [ ] **折叠光标进出防护**（需真机手测确认）— 折叠后方向键能否把光标移入 `display:none` 的隐藏块并不可见输入，jsdom 无法验证；实测可达则补方向键拦截。
* [ ] **非激活面板的保存不拉取（`_panelActive` 闸门）** — 保活下非激活面板其实还活着、多半能回包，但 `_requestContent` 仍按保守口径短路（用 `_pushedContent` 最陈旧 400ms 或扩展内存内容落盘）。**owner 真机手测（2026-09-13）：停手后立刻切标签，最后一次改动仍写进了文件，「400ms 窗口」未复现**——路径上存在理论窗口、真机上未被观测到。放开闸门能否更稳仍需真机验证；未验证前不改行为（回归 a4349cc 曾报「编辑器无响应」）。

***

## 已清偿

> 只留结论与去向；细节在对应 commit / `docs/audits/`，不再逐一复述。

### 2026-10-31 结构收尾（本轮）

* [x] **三个巨型单元拆分完成**（本轮 + 10-27/29 批次累计）：
  * `src/MarkdownEditorProvider.ts` **1,480 → 920 行**。外移 `src/editor/`：`imageMessageHandlers`（357）、`externalChange`（203）、`navigation`（127）、`writeAudit`（113）、`statusBar`（83）、`pathLinks`（73）、`webviewHtmlBuilder`（64）、`fileWatcher`（43），全部用显式 context/host 接口注入、无循环依赖；公开 API 与测试可达名保留薄委托。
  * `webview/index.ts` **843 → 508 行**。外移 `webview/app/`：`persistence`（142，内容推送/滚动/选区）、`imageRequests`（246）、`scrollTargets`（102，PendingScroll + 延迟滚动 + 折叠恢复）、`linkBehavior`（71）。
  * `webview/editor.ts` **545 → 338 行**。外移 `webview/editor/`：`editorSession`（147，SavedSnapshot 对象化）、`continuity`（85）、`mermaidPreview`（102）、`cmTheme`（50）、`serialization`（44）、`plugins/formatKeymapPlugin`（49）；`editor.ts` 变门面，公开导出不变。
  * 目标与依据：`docs/audits/2026-10-27-refactor-ext-audit.md` A3、`webview-audit.md` F1/F2。入口 CSS 导入顺序、`acquireVsCodeApi` 时机、同 target+event 监听顺序均保持。
* [x] **F10 状态所有权** — `SavedSnapshot`（markdown+doc 一起更新）与 `PendingScroll` 对象化；`webview/editor.ts` 模块级 `let` 6 → **0**、`index.ts` 16 → 11、全 webview 生产 `let` 53 → 32（剩余为页面级单例，文件头已标注）。`headingStickyPlugin.destroy()` 复位当前标题位置并通知订阅者（加 owner token 防 Milkdown 异步销毁清掉新实例状态），TOC 不再继承旧文档高亮。
* [x] **F11 重复实现收敛完成** — `ui/anchoredOverlay`（topBarOverflow + tableGridPicker）、`ui/lightbox`（imageView + codeBlockEnhance）、`pathCompleteCore`（imgPathComplete + pathComplete）、`ui/modifierKeys`（body class + pathLink 同源）、`scrollTargets.applyPendingScrollLine`（两条 scrollToLine 路径共用）、`topbarMetrics.topbarHeight()`（5 处收敛）。新增/改写测试 49+ 例。
* [x] **F4 源码文本测试收口** — `tableInlineMathSelect` 删除全部 `readFileSync` 切源码断言，改为 4 个真实编辑器行为用例；`componentCssLocality` 改为 CSS 规则结构 + 模块图断言（不再读组件 `.ts` 的 import 字面量）；`latexBubbleBounds` / `bubbleBoundary` 的 vendored/CSS 文本断言逐处注明「vendored 上游/jsdom 无布局」理由，未削弱断言。
* [x] **覆盖率 54.8% → 73.75%（行）/ 73.90%（函数）**（110 个测试文件 / 967 例，2026-10-31 实测）— 拆分让 `src/editor/**`（89.8%）、`webview/app/**`、`webview/editor/**`、`ui/*` 可直接单测；`vitest.config.ts` 阈值 54/56 → **70/70**，AGENTS 同步。目标 65% 已超额完成。
* [x] **9 条遗留缺陷修复**（每条均有回归用例）：
  1. **defer-before-revert**：外部变更先 `workspace.fs.readFile` 取盘上文本再决策；只有 `adoptDisk` 才更新 document + 发 revert，defer 不再提前改模型（`externalChange.test.ts` 10 例）
  2. **`switchToTextEditor` 空保存守卫**：保存前读真实盘上文本作 `diskText`，命中 `shouldSkipSave` 则跳过写盘并清脏（provider 20+ 例）
  3. **`saveCustomDocument` 的 `diskText` 也读真实盘**：仅在「本次内容 == 上次写入」时多读一次盘，避免内存模型滞后时把陈旧缓冲区写回（B2b 回归用例）
  4. **`_handleImageRename` 走 `resolveDocPath`**：`@/` 图片重命名不再报 Image not found
  5. **`@/` 无工作区回退口径统一为方案①**：全部回退文档目录；路径补全的 `@/a/b` 不再丢弃剩余路径（`docPath.test.ts` 更新；工作区存在时行为不变）
  6. **`resolveImagePath` 异步化**：`fs.existsSync` → `vscode.workspace.fs.stat`，fs 导入统一，watcher 同步注册 `onDidDispose`（消除理论泄漏窗口）
  7. **`normalizeTableWrapMode`**：`shared/tableWrap.ts` 归一化，`extension.ts` 广播与消息类型收窄（A16）
  8. **fire-and-forget 统一 `fireAndLog`**：`vscode.open` / `openExternal` / `openSettings` 失败不再静默（A8）
  9. **静默失败收口**：图库目录读不到回可见 notice（l10n 中英新键）；路径解析失败补 `console.warn`；4 处空 catch 改记录日志（A9/A2 残留）
* [x] **写盘审计日志有界化** — `WriteAudit` 2MB 轮转（超出改名 `.1`），常量命名；不再无界 append。
* [x] **测试文件命名规范对齐** — AGENTS 测试章改为「文件名以被测模块名为前缀，同一模块允许场景后缀」，与仓库现状一致（改 AGENTS 已按 C9 在交接报告中标注，待 owner 追认）。
* [x] **可复现冒烟工具** — 新增 `scripts/smoke-webview/` + `pnpm run smoke`：本机 Edge headless 加载**构建后的** `dist/webview.js`，通过真实消息协议验证 init/保存往返/真实键盘输入/配置 CSS 变量/scrollToLine/选区持久化/revert/懒加载代码块 chunk/无页面错误，共 14 项断言。`.vscodeignore` 已排除 `scripts/**`（不进 VSIX）。

### 更早清偿

* [x] **保存竞态：重建窗口内 `requestContent` 可能应答上一份内容**（2026-10-27 处理：**真机扫窗口未复现**，改为从构造上消除 + 契约用例锁定）— revert 内容本就来自磁盘，在重建开始前调用 `adoptDiskContentAsBaseline(msg.content)` 把它设为保存基线，于是「无编辑器时返回基线」天然只会返回磁盘内容；`editorSaveBaseline.test.ts` 3 例。仅对 `revert` 生效（`init` 可能携带未落盘编辑）。详见 webview-audit F3
* [x] **per-uri 状态无统一所有权：18 个容器，dispose 只清 9 个**（2026-10-27 已修、2026-10-29 复核、2026-10-31 再外移）— 清理收敛到 `_disposePanelState()` 一次清全部容器；`_pendingNavigations` 统一 uriKey；`markdownEditorProvider.test.ts` 反射枚举每个 Map/Set（含外移状态模块）守「一个都不能漏」。**残余**：Provider 仍有若干平铺 per-uri Map，`DocumentState` 对象化未做（结构收益已低，移入「暂缓」）。
* [x] **webview 消息入口无兜底 + 4 处静默吞异常**（2026-10-27 入口 try/catch；2026-10-29 补 `import("fs")` catch；2026-10-31 4 处空 catch 改记录日志）详见 ext-audit A2
* [x] **覆盖率门禁口径失真：只覆盖 28.2% 的生产行**（2026-10-27 改为覆盖 `src/**` + `webview/**` + `shared/**`；此后 55.1%→54.8%→73.75%，阈值从 50/53 → 54/56 → **70/70**）— 原白名单 46/83 文件、3,913/13,856 行，三个最大单元不在分母，「98.92%」名不副实。
* [x] **顶栏：高度重复已收敛、清单漂移已可见；真正的单源待上游支持** — 高度 5 处收敛为 `topbarHeight()`；清单无法单源（Crepe item 不暴露 id/aria），改为按钮数与文案数不一致时 warn 一次（`topBarTooltipDrift.test.ts` 2 例）。
* [x] **生命周期契约：已按「页面级 / 实例级」分类处置** — 只给 toc 加 `dispose()`（`tocDispose.test.ts` 3 例）；四个页面级单例在文件头标注「无 teardown，不要 dispose」。keepalive 下无可观测泄漏。
* [x] **`createImageView` 销毁漏掉内联路径补全 detach → document 监听泄漏**（`startToolbarInlineEdit` 返回幂等清理，`destroy()` 调用；`imageViewInlineEdit.test.ts` 3 例）
* [x] **重建清理清单不完整（漏浮层）**（导出 `closeTableGridPicker()` / `closeImagePicker()`；`overlayTeardown.test.ts` 3 例）
* [x] **图片本地目录降级静默**（`imageService` 传播 `downgraded`，Provider 回 notice，l10n 中英；2 例）
* [x] **空保存守卫：没编辑就绝不写盘**（2026-10-28 `shouldSkipSave`；2026-10-31 补真实盘读取）；**并发写入方两个方向**（2026-10-28 三处补齐 + 一次可见警告）；**编辑器「自己跳回编辑前状态」**（2026-10-28 authoritative/defer 修复）。用例：决策 16 例 + 协调器 4 例 + provider 回归用例。
* [x] **路径解析：4 份重复收敛为 `src/utils/docPath.ts`**、**第 5 处 `_handleImageRename` 收口**（2026-10-31）
* [x] **重构收尾（2026-10-29）**：清 5 条生产侧死 import、旧路径注释、重复 import、格式毛刺与未用参数；两个 `tsconfig` 开启 `noUnusedLocals` / `noUnusedParameters`。
* [x] **表格 `<br>` 往返闭环——结论更正：不能拆**（2026-10-27 探针实测上游仍未修：`convertTableBrForDisplay` 与 `withTableBreakHandler`/`preserveTableBreakStyle` 互为条件；只删了恒等转发层 `serializeCleanMarkdown`）
* [x] **挂钟性能断言已从单测移除**（结构断言替代；性能只在 `*.bench.ts`）
* [x] **保存保真 ①（部分）：列表散紧被强制重算 + 真实层级变化被写回旧值**（v1.3.0；`minimalDiff`/`listSpread` 修复；有意的行为变更见 CHANGELOG）
* [x] **保存保真 ④：以列表/表格结尾的文档，编辑后不再多末尾空行**（7.22.3 后消失）
* [x] 折叠期守卫真机复测 + 保活架构定案（2026-09-11；读数见 `docs/audits/2026-09-11-tab-switch-flicker-measurement.md`）
* [x] 顶栏溢出 resize 监听器未释放（2026-09-11；有回归测试）
* [x] 2026-09-08 全面审计修复 33 项（详见 `docs/audits/2026-09-08-full-code-audit.md`）
* [x] `resolveCustomEditor` / `setupSelectionToolbar` / `initToc` / `createImageView` 拆分（2026-09-05）
* [x] selectionToolbar 死代码整体删除（2026-09-04，-1025 行）
* [x] 魔法数字常量化 → `shared/constants.ts`（25 常量 / ~55 处）
* [x] `buildTopBar` 类型安全与拆分（8 处 `any` 清零）
* [x] 下拉补全重复 → `ui/pathCompleteCore.ts` + `webview/images/pathSuggestionRequests.ts`
* [x] 确认/取消编辑重复 → `startToolbarInlineEdit`（`components/imageView`）
* [x] 顶栏 P 下拉被 `overflow:hidden` 裁剪 → `overflow: visible` + CSS 回归测试
* [x] 12 处空 catch 补注释
* [x] 真实 300×150 被误判为宿主折叠 → 基于用户输入区分（`data-epytor-tiny-real`）
* [x] **配置面收敛：14 → 7 项**（4 个弃用旧键仅兜底、带 `deprecationMessage`）
* [x] 测试补齐：`themeBus.ts` / `i18n/index.ts` / `MarkdownDocument.ts` / `imageService.ts` 的边界与覆盖率

***

## 暂缓处理

以下项目已识别但当前不紧急，择机处理。

### 🟡 结构可选项

* [ ] **`DocumentState` 对象化** — Provider 仍有若干平铺 per-uri Map（面板/脏标记/上次写入/frontmatter 等），但状态已按职责外移到 `src/editor/` 的独立所有者，Provider 降到 920 行；纯对象化的结构收益已低，且改动面大、收益主要是可读性。等下次真正改保存/面板生命周期时顺手做。
* [ ] **`style.css` 迁移遗留的 link-tooltip 段** — 2026-10-27 批次只迁移了 frontmatter / 代码块 / 顶栏三段；link-tooltip(1111-1293) 仍在全局。跟随 `!important` 清理一起做。

### 🔴 上游 workaround

* [ ] **切标签「整块闪一下」= 宿主行为，扩展侧抑制已到顶**（2026-09-12 定案）— 平台行为、接受；读数与「不采用销毁路线」的理由见 `docs/upstream-limits.md` 第 4 项与 `docs/audits/2026-09-11-tab-switch-flicker-measurement.md`。
* [ ] **`cellClickFixPlugin`**（`webview/editor/plugins/cellClickFixPlugin.ts` 231 行 + `webview/table/cellClickState.ts`）— `filterTransaction` + `appendTransaction` + `requestAnimationFrame` 多层拦截，对抗 Crepe 表格单击行为不稳定。**需等上游 [Milkdown#2414](https://github.com/Milkdown/milkdown/issues/2414) 修复后移除**（2026-10-18 复核：仍 open）。
* [ ] **vendor latex feature 上游同步**（`webview/vendor/latexFeature.ts`）— 升级 `@milkdown/crepe` 时按文件头「§上游对照」逐节 diff 上游 `src/feature/latex/*`；若上游改为惰性加载 katex，可移除 vendor 与 `esbuild.mjs` 的 katex-stub-for-crepe。**7.22.3 无 latex 改动；待上游 open PR #2497 合并后再评估**。

### 🔴 官方无替代（已查证）

* [ ] **顶栏 button tooltip 注入**（`webview/components/topBar/topBarDecorations.ts`，MutationObserver 扫描）— **7.22.3 官方 `TopBarItem` 仍只有 `{ active, icon, selector? }`，无文案字段**；MutationObserver 注入是唯一可行手段。

### 🟠 DOM 刮削 / MutationObserver 反模式（剩余）

* [ ] **语言列表键盘导航**（`webview/components/codeBlockEnhance/index.ts`，操作 `.language-list-item` 内部 DOM）— 影响面小，暂缓。
* [ ] **代码块全屏按钮注入 / CodeMirror 主题补配 / 溢出菜单与官方 Vue 渲染的耦合点** — 均需上游提供能力或观察器机制改版；现状有防回环守卫与回归测试（`cmThemeObserver.test.ts`、`topBarOverflow.test.ts`、`style.test.ts`）。

### 🟢 脆弱事件处理

* [ ] **`capture` 阶段事件监听（9 处）** — Milkdown 短期不会大改事件机制，暂不处理。
* [ ] **链接点击 `stopImmediatePropagation`**（`webview/app/linkBehavior.ts`）— 运行稳定，暂不处理。

### 工具链

* [ ] **集成测试（@vscode/test-electron + Mocha）** — 见「待处理·中优先级」。

***

## 2026-10-27/31 审计确认「不是问题」的部分（避免重复投入）

* **类型逃逸在生产侧已达标**：生产 `: any` 0、`as any` 0、`@ts-ignore` 0；`as unknown as` 与非空断言几乎全在测试（2026-10-31 复查无新增）。
* **生产侧重复度低**：6 行窗口 358 个重复块里 351 个是 test–test，prod–prod 仅 4 块、约 71 行。
* **依赖与产物健康**：17 prod + 10 dev 依赖；生产 dist 7.4 MiB / 234 文件（拆分后 bundle 体积基本持平）。
* **不宜「推倒重写」**：真正的问题是少数巨型单元、状态所有权、覆盖门口径与测试耦合——已按批次拆分收敛；重写会丢失已积累的回归用例。
