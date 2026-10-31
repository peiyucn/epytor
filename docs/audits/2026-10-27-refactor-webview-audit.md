# WebView / Shared 重构审计（只读）
> **基线说明（2026-10-29 补）**：本报告的路径 / 行号 / 文件大小均为 2026-10-27 重构前快照；重构后 `webview/utils/` 已按功能域拆到 `webview/app/`、`editor/`、`markdown/` 等目录，行号可能失效，结论以 `docs/tech-debt.md` 的最新记录为准。

- **日期**：2026-10-27
- **仓库/分支**：`epytor`，`dev`，HEAD `252b647`，工作区含 1.3.0 未提交批次（`webview/index.ts` +76 行、`editor.ts` +102 行，`git diff --stat`）
- **范围**：`epytor/webview/**`、`epytor/shared/**`、`epytor/webview/__tests__/**`。**未审** `src/`（仅在标注处引一行做跨界证据）。
- **快照**：源文件 80 个 / 13537 行（TS+CSS）；webview 测试 64 个文件 / 7548 行（另有 4 个 bench / 296 行）。`pnpm test`：**80 files / 715 tests 全绿，264s**（本机实跑，命令见 §9）。
- **只读声明**：未修改任何源码；本报告与 `metrics.json` / `deadcode.json` / `type-escapes.json` 等原始数据均在 `TEMP/audit/`。
- **路径约定**：正文中不带目录的 `index.ts` / `editor.ts` / `components/**` 一律指 `epytor/webview/` 下；不带目录的 `*.test.ts` 指 `epytor/webview/__tests__/` 下；`messages.ts` / `constants.ts` 指 `epytor/shared/` 下。
- **工作量口径**：S ≤ 0.5 天；M 1–2 天；L > 2 天（单人、含测试）。

---

## 0. 按严重度排序的问题表

| # | 严重度 | 问题 | 证据（file:line） | 影响 | 建议动作 | 量 |
|---|---|---|---|---|---|---|
| F1 | 高 | `webview/index.ts` 1147 行，混 10 类职责；无任何测试引用 | `webview/index.ts:1-1147`；`handleEditorLifecycleMessage` 954-1055（102 行）、`handleRegularMessage` 1058-1147（90 行）、`initEditor` 406-482（77 行）；命令：无测试 import `../index` | 改消息路由/保存/滚动任一链路回归面覆盖全文件；全仓最大的 0 测试模块 | 分 3 个独立 commit 抽 `scrollSync.ts`（140-249）、`persistence.ts`（752-801）、`imageRequests.ts`（251-309）；index 只留生命周期与路由 | L |
| F2 | 高 | `editor.ts` 942 行；`createEditor` 299 行混 6 类职责 | `editor.ts:644-942`：CM 主题 694-711 / mermaid 714-812 / 主题订阅 757-775 / feature 注册 814-838 / 序列化配置 872-921 / 插件注册 843-932；`cellClickFixPlugin` 180-410 共 231 行（tech-debt 记 ~130 行，已过期） | Crepe 升级、序列化、主题、mermaid 四类改动互相踩；无法单点测试 | 抽 `mermaidPreview.ts`（714-812 + 757-775 的 mermaid 段）与 `cmTheme.ts`（694-711），`createEditor` 只留注册顺序 | L |
| F3 | 高 | 重建窗口内 `requestContent` 可能返回**上一份内容**（竞态，代码路径可证，未真机复现） | `editor.ts:628-629`（`_editor` 为 null 时返回 `_savedMarkdown`）、`editor.ts:874`（重建时才把 `_savedMarkdown` 改成新内容）、`index.ts:876-886`（只有 init/revert 串行化，regular 消息不入链）、`index.ts:1097-1100`；`index.ts:332-333` 注释已承认同一竞态并只修了 push timer | 外部写盘触发 revert 期间按 Cmd+S，可能把旧内容写回文件 | `getMarkdownForSave()` 在无编辑器时返回 `null`/抛可识别错误；`requestContent` 分支等 `_editorLifecycleChain` 完成后再应答；补一条单测 | S–M |
| F4 | 高 | 7 个 webview 测试用 `readFileSync` 对源码/CSS 文本做断言，重构会**假失败** | 读 .ts：`mermaidErrorFallback.test.ts:22-36`（断言 `editor.ts` 中 `.initialize(` 恰好 2 次）、`latexBubbleBounds.test.ts:18-45`、`bubbleBoundary.test.ts:105-155`、`tableInlineMathSelect.test.ts:48,147`；读 CSS：`style.test.ts:6-16`、`tocTransitions.test.ts:22`、`inlineAtomSeparator.test.ts:107`。另 2 个（`i18n.test.ts:56,90`、`katexCompat.test.ts:63`）读源码/配置属合理用途 | 本报告建议的 editor/CSS 拆分会被测试挡住，且失败原因与行为无关 | 拆分前先把这些断言改为行为断言（import 函数 / jsdom computed style）；或在同一 commit 内同步改测试并注明 | M |
| F5 | 中高 | 顶栏按钮存在**三份独立清单** + 7 处顶栏高度计算 | 清单：`buildTopBar.ts:29-321`（item 定义）、`topBarOverflow/index.ts:25-42`（`ITEM_LABELS` 16 项）、`topBarDecorations.ts:11-31`（`TOOLTIPS` 19 项，按 DOM 下标对齐）；高度：`index.ts:163`、`index.ts:211`、`index.ts:502-503`、`toc/index.ts:363-364`、`findBar/index.ts:188`、`headingStickyPlugin.ts:63-66`、`vendor/latexFeature.ts:383` | Crepe 增删/重排一个按钮时：tooltip 静默错位、溢出菜单 key 映射错、高度口径漂移；无编译期保护 | 建 `components/topBar/topBarMeta.ts`（key→label/icon，唯一真源）+ `ui/topbarMetrics.ts`（`getTopBarHeight()/getTopBarBottom()`），两个组件与 7 处调用点改用它 | M |
| F6 | 中高 | DOM 刮削 + 4 个 MutationObserver 无 `disconnect`；回调在每次 DOM 变更的 rAF 里全量查询 | 刮削：`codeBlockEnhance/index.ts:30-32,42-62,104,115-118`（12 个上游 class）、`topBarOverflow/index.ts:83,186,193,198-209`（按 DOM 顺序对 `_meta` 下标）、`topBarDecorations.ts:33-44`；observer：`codeBlockEnhance:106-107`、`topBarDecorations:48-49,63-64`、`themeBus:33-38`（单例）；`viewportLedger:202-211` 的 RO 无句柄 | 上游结构变化时静默错位（tooltip 贴到别的按钮、溢出算错）；三个 observer 的 rAF 回调在输入热路径上各做一次 `querySelectorAll`（未量化）；无法在测试里干净拆装 | 先做 F5 的 key→label 单源；给两个 observer 回调加「无事可做就早退」守卫（如先查 `.top-bar-item:not([data-tip])` 再排 rAF）；**不要在编辑器重建时 dispose**（容器跨重建复用，dispose 会让新按钮不再被装饰）；加固定 DOM 快照测试 | M |
| F7 | 中 | 组件生命周期契约不统一：7 处 init/setup 无 teardown 句柄 | `toc/index.ts:570-581`（resize + scroll + 7 类交互 + `onActiveHeadingChange` 订阅 572），返回值 588 无 dispose；`findBar/index.ts:207-244`（8 个），返回值 271 无 dispose；`pathLink/index.ts:43-99`；`pathComplete.ts:126-157`；`viewportLedger.ts:205-211`；`codeBlockEnhance.ts:31,106,113`；`topBarDecorations.ts:48-49,63-64` | 现网 webview 生命周期=页面生命周期，**没有可观测的累积泄漏**；但（a）测试内重复 init 会累积（`tocRefresh.test.ts:96,215`）；（b）将来做「按需挂载/重建 UI」时无清理手段；（c）模块级监听让测试无法拆装 | 只给 toc/findBar 加 `dispose`（toc 已在测试里重复实例化）；对页面级单例（viewportLedger/userInteraction/themeBus/topBarDecorations）在文件头显式标注「页面生命周期，无 teardown」；不要机械地给所有 init 加 dispose 并在编辑器重建时调用 | M |
| F8 | 中 | `createImageView` 销毁时漏掉内联编辑的路径补全 detach → document 监听泄漏，下拉可能残留 | `imageView/index.ts:569-572`（`setupComplete: attachImgPathComplete`）、`startToolbarInlineEdit` 172-235（detach 只在 confirm/cancel 的 `cleanup` 226-234 调用）、`destroy` 667-687 未调用；`imgPathComplete.ts:202` 注册 document mousedown、206-214 detach | 编辑图片路径时节点被重建/删除（revert、undo、外部改盘）→ 泄漏一个 document 监听；若下拉已展开，`<ul>` 留在 body，直到下一次外部点击才被它自己的关闭逻辑收走（该逻辑也随监听继续存在） | `startToolbarInlineEdit` 返回 cleanup；`createImageView` 保存 `detachInlineEdit` 引用，`destroy()` 调用；加 jsdom 用例（销毁后派发 document mousedown，断言旧 dropdown 已关闭且无 select 回调） | S |
| F9 | 中 | 重建清理清单不完整：只清代码块灯箱和溢出菜单，未清表格选择器/图片选择器 | `index.ts:411-421`（`closeCodeBlockLightbox` + `topBarOverflow.dispose` + `releaseDocTimers`）；`tableGridPicker/index.ts:9-12,96-106` 的 `_activePanel` 与三条 document/window 监听无关闭入口；`imagePicker/index.ts:17-21,185` 的 overlay 同样 | 重建时残留浮层可对已销毁的 ctx 执行命令（后果未真机验证）；与已修的灯箱同类问题 | 导出 `closeTableGridPicker()`、`closeImagePicker()`，在 `initEditor` 清容器前统一调用；补一条「重建后 body 无 `.epytor-grid-picker`/`.epytor-img-picker-overlay`」测试 | S |
| F10 | 中 | 49 个模块级 `let`，无所有权；`index.ts` 16 个、`editor.ts` 6 个 | 命令：`Select-String '^let\s'` = 49；分布：index 16、editor 6、topBarOverflow 5、tableGridPicker 4、collapseScrollGuard 4、imageView 2、headingSticky 2、latexFeature 2、notice 2、其余 6 个各 1。多处写：`_pendingScrollLine`（`index.ts:949,1025,1081`）、`_savedDoc`（`editor.ts:466,620,640,940`）、`_hasUnsavedChanges`（`index.ts:428,708,1099`）、`_isActivePanel`（`index.ts:810,965,1062`）；`_activeHeadingPos`（`headingStickyPlugin.ts:34`）在 destroy（456-470）不重置 | 状态「谁负责」只能靠读全文件；重建后旧值残留（如 `_activeHeadingPos` 对新文档高亮） | 先做两个对象封装：`SavedSnapshot`（3 字段 + 方法）与 `PendingScroll`；`headingStickyPlugin` 的 `_activeHeadingPos` 在 destroy 复位并通知订阅者 | M |
| F11 | 中 | 重复实现 6 组（浮层脚手架、灯箱、路径补全、顶栏高度、修饰键、scrollToLine 分支） | 浮层：`topBarOverflow:99-163` vs `tableGridPicker:14-107`；灯箱：`imageView/index.ts:63-114` vs `codeBlockEnhance:56-99`；路径补全：`imgPathComplete:62-72,78-80,104` vs `pathComplete:59-67,63,93-96`；修饰键：`index.ts:114-120` vs `pathLink:43-64`；scrollToLine：`index.ts:1023-1025` vs `1079-1082`；basename：`imageView:133-137`、`imgPathComplete:78-80`、`pathComplete:63` | 同类修一处漏一处（历史回归 P3/P4/P8 均源于此） | 抽 `ui/anchoredOverlay.ts`（Esc/外部点击/滚动关闭 + 视口 clamp）与 `ui/lightbox.ts`；路径补全的 `lastSeg/showIconItem/retrigger` 并入 `pathCompleteCore` | M |
| F12 | 中 | CSS：`style.css` 1293 行 / 174 条规则 / 138 条 `!important` 声明；组件样式散在全局 | `style.css` 全仓 `!important` 声明 152 条（style 138、latex 8、toc/topBarOverflow/heading 各 2）；style.css 中 frontmatter 37-152（约 116 行）、代码块 505-684、代码块灯箱 686-762、顶栏 912-1063、浮动工具栏 1064-1110、link-tooltip 1111-1293 均为组件样式；`heading.css:63-136` 同时服务 `headingStickyPlugin`（该插件不 import 任何 CSS） | 主题/版式改动要跨文件搜；`!important` 军备竞赛（`icons.ts:13` 的内联 `fill:none!important` 至少逼出 style.css 7 处 `fill:…!important`：851/979/985/1038/1098/1102/1146） | ① 把 frontmatter 段迁 `components/frontmatterPanel/frontmatterPanel.css`、代码块灯箱迁对应组件（注意 import 顺序：组件 CSS 会在 style.css 之后加载）；② 去掉 `icons.ts:13` 内联 `!important`，逐条清 7 处 fill 规则；③ 加 `style.test.ts` 的 `!important` 数量上限断言防增长 | M |
| F13 | 低 | 类型债：`any` 已清零，但 webview state 无类型，靠 5 处形状断言；6 处非空断言 | 0 个 `any` / 0 个 `as any`；`as unknown as` 仅 `editor.ts:108,114`；非空断言 6 处：`codeBlockEnhance:97`、`findBar:137`、`headingStickyPlugin:248`、`tooltip:74`、`headingFold:139`、`latexFeature:535`；`getWebviewState(): Record<string, unknown>`（`messaging.ts:114`）→ `index.ts:789,931,1027,1031` 与 `index.ts:996`（对 `msg` 的收窄逃逸） | 状态键拼写错误不会被编译期发现；`msg` 的联合收窄失效 | 定义 `WebviewState` 接口 + `readWebviewState()`；`(msg as { scrollToLine?: number })` 改用 `isInit && msg.scrollToLine` 判别收窄 | S |
| F14 | 低 | 死代码与过宽导出面 | 真死 3 个：`ui/icons.ts:28-30`（`IconPin`/`IconChevronsUp`/`IconChevronsDown` 全仓各 1 次命中=仅声明）；未用 import：`editor.ts:3,7,14`（`defaultValueCtx`/`rootCtx`/`listItemSchema`，`tsc --noUnusedLocals` 输出）；未用变量：`pendingRequest.ts:35` `settleResolve` 只赋值不读；72 个导出仅定义文件内部使用（fileIcons 21 个 svg、latexFeature 15 个内部常量等）；33 个导出仅测试引用（viewportLedger 9、toc 5 等）；`window.__i18n.serializationMode`（`i18n/index.ts:8`）由 `src/MarkdownEditorProvider.ts:1081` 注入但 webview 从不读取 | 认知负担；误以为有外部契约 | 一次 commit：删 3 图标 + 3 个 import + `settleResolve`；收窄 fileIcons/latexFeature 导出；`__i18n.serializationMode` 确认后连同 src 注入一起删 | S |
| F15 | 低 | 消息路由是 19 分支 if/else，无穷尽检查；未知类型靠 `as` 打印 | `shared/messages.ts:48-70`（ToWebview 19 种）；`index.ts:1059-1145`；兜底 `index.ts:1143-1145` 用 `(msg as { type: string }).type`，不是 `never` | 新增消息类型漏处理时编译不报错、测试也没有路由覆盖 | 改 `switch` + `default: assertNever(msg)`；把路由抽成可导入函数（为 F1 铺路），至少补 `requestContent`/`panelActiveState`/`scrollToLine` 三条测试 | S |
| F16 | 低 | 文档/注释漂移与格式不一致 | `docs/tech-debt.md` 的「index.ts 剩余职责」条记 1013 行（当前非空 1087 / 总 1147）、「`cellClickFixPlugin`」条记 ~130 行（实测 231）、「142 处 `!important`」条（style.css 原始出现 142、实际声明 138，全仓声明 152）——该文件 16:17 被并行编辑过，故按条目标题引用而不给行号；`utils/tableWrap.ts:11` 仍写「三档映射」（实际两档）；`index.ts:487-489` 两行重复注释且 487-541 共 55 行用 Tab 缩进，与全文件 4 空格不一致 | 接手者按文档估算工作量会偏 | 单独一个 `docs:` commit 同步 4 处数字/表述；`chore:` commit 统一 487-541 缩进并删重复注释 | S |

> 说明：严重度是「对重构与回归风险」的排序，不是线上故障等级。F1/F2 是结构性成本，F3 是唯一可能造成内容损失的一致性缺陷（未真机复现）。
>
> 并行状态：`docs/tech-debt.md` 于 2026-10-27 16:17 被并行编辑，已把 F3（重建窗口 `requestContent`）列入高优先级；本报告保留同一结论，用于给出 webview 侧的完整代码路径。其余条目以本报告为准。

---

## 1. 超大文件与超长函数

### 1.1 `webview/index.ts`（1147 行，非空 1087）

按行号切出的职责（本次审计的口径，均可在文件中直接定位）：

| 行段 | 职责 | 备注 |
|---|---|---|
| 1-15 | 10 个 Crepe 主题 CSS + 本地 CSS 副作用导入 | 导入顺序本身有语义（覆盖上游） |
| 77-111 | 语义常量 + 会话级可变状态（全文 16 个 `let` 的集中声明区起点） | `_topBarOverflowCtl`、`currentEditor`、行号表、三个 timer、`_isActivePanel` 等 |
| 113-120 | 全局 Ctrl/Meta 状态 class | |
| 122-249 | 源码行 ↔ 视口位置双向换算（`scrollToSourceLine`/`getFirstVisibleSourceLine`/`getSwitchTargetLine`/`getContentBlockElements`/`stickyBarHeight`） | 纯几何 + DOM 读取，最该先抽 |
| 251-309 | 三个 `PendingRequestRegistry` + 图片上传/插入 | |
| 311-316 | TOC / 查找栏实例化 | |
| 318-347 | 文档相关防抖 timer 的释放 | |
| 349-370 | frontmatter 面板渲染/销毁 | |
| 372-404 | Word 风格字数统计 | |
| 406-482 | `initEditor`：销毁旧实例 + 建新实例 + 两帧后刷新 TOC/字数 + 初始化溢出菜单 | 77 行 |
| 484-694 | 链接点击/滚动关 tooltip/图片插入事件/图片灯箱/底部空白点击/拖放/粘贴/两个快捷键 | 一个 `if (editorContainer)` 块里 13 个监听/初始化调用 |
| 699-801 | 未落盘内容推送（400ms 尾沿）+ 滚动/光标位置持久化 | |
| 803-852 | 焦点恢复（多 webview 抢焦点修复） | |
| 854-951 | 消息订阅、init/revert 串行链、延迟滚动状态机、折叠恢复、待定位行 | |
| 953-1055 | `handleEditorLifecycleMessage`（102 行） | |
| 1057-1147 | `handleRegularMessage`（90 行，19 分支） | |

**结论**：不是「一个入口文件稍大」，而是 **10 类职责**（① 依赖/CSS 装配 ② 常量与会话状态 ③ 行↔视口换算 ④ 图片请求 ⑤ frontmatter/字数 ⑥ 编辑器生命周期 ⑦ DOM 事件接线 ⑧ 内容推送与位置持久化 ⑨ 焦点管理 ⑩ 消息路由）；下表按 16 个「可独立搬走」的段切开。其中 122-249（纯几何）、752-801（持久化）、251-309（请求注册）与消息路由无耦合，适合第一批拆。

### 1.2 `webview/editor.ts`（942 行，非空 879）

| 行段 | 职责 |
|---|---|
| 1-115 | 依赖导入 + 语言白名单 + 两个 CodeMirror `LanguageDescription` 桩 |
| 129-175 | 格式化快捷键插件 + 列表 spread 规范化插件 |
| 177-441 | 表格单元格点击修正（`cellClickFixPlugin` 180-410 + `atomPosAtEvent`/`cellStartAt`） |
| 443-468 | 编辑器单例与保存快照状态 |
| 475-501 | 保存前序列化管线（clean/compatible/行尾/最小 diff） |
| 508-607 | 编辑连续性采集与恢复 |
| 609-642 | `destroyEditor` / `getMarkdownForSave` |
| 644-942 | `createEditor`（299 行）：CM 主题 694-711 + mermaid 714-812 + 主题订阅 757-775 + `renderPreview` 778-812 + feature 831-838 + 序列化配置 872-921 + 插件注册 843-932 |

`createEditor` 内部已经出现「一处改动要同时改 3 个段」的耦合：例如 mermaid 的 `initialize` 配置同时被 `loadMermaid`（738-748）与主题回调（757-775）使用；`mermaidErrorFallback.test.ts:29-36` 又用「`.initialize(` 恰好 2 次」把这两个点钉死，直接阻碍拆分（见 F4）。

### 1.3 超长函数 TOP 12（AST 计算，起止行为 1-based）

| 函数 | 位置 | 行数 |
|---|---|---|
| `initToc` | `components/toc/index.ts:118-589` | 472 |
| `createImageView` | `components/imageView/index.ts:238-689` | 452 |
| `headingStickyPlugin` 的 `view()` | `headingStickyPlugin.ts:85-472` | 388 |
| `createEditor` | `editor.ts:644-942` | 299 |
| `buildTopBarConfig` | `components/topBar/buildTopBar.ts:29-321` | 293 |
| `initFindBar` | `components/findBar/index.ts:25-272` | 248 |
| `cellClickFixPlugin`（工厂整体） | `editor.ts:180-410` | 231 |
| `createFrontmatterPanel` | `components/frontmatterPanel/index.ts:17-205` | 189 |
| `showImagePicker` | `components/imagePicker/index.ts:9-186` | 178 |
| `initTopBarOverflow` | `components/topBarOverflow/index.ts:165-337` | 173 |
| `attachImgPathComplete` | `components/imageView/imgPathComplete.ts:47-215` | 169 |
| `handleEditorLifecycleMessage` | `index.ts:954-1055` | 102 |

另：`initToc` 内部还嵌套了 `createItem`（307-384）、`refresh`（403-443）、`bindPositions`（390-401）、拖拽宽度（507-542）、自动显隐（545-557），是「一个函数一个组件」的典型；`createImageView` 嵌套了 ratio 编解码、重试加载、resize、caption/src 两套内联编辑、toolbar 装配。

---

## 2. 全局可变状态

命令：`Get-ChildItem ... | Select-String '^let\s'` → **49 处模块级 `let`**（15 个文件）。另有 9 个模块级 `const … = new Map/Set`，其中 4 个是运行期可变的共享容器：

| 容器 | 位置 |
|---|---|
| `_pendingResolve` | `components/imageView/imgPathComplete.ts:15` |
| `_uriToRel` | `components/imageView/index.ts:32` |
| `listeners`（主题订阅） | `utils/themeBus.ts:3` |
| `_activeHeadingListeners` | `headingStickyPlugin.ts:35` |

分布：

```
16  webview/index.ts
 6  webview/editor.ts
 5  components/topBarOverflow/index.ts
 4  utils/collapseScrollGuard.ts
 4  components/tableGridPicker/index.ts
 2  components/imageView/index.ts
 2  headingStickyPlugin.ts
 2  vendor/latexFeature.ts
 2  ui/notice.ts
 1 × 6：toc / tooltip / themeBus / userInteraction / viewportLedger / codeBlockEnhance
```

**「多处写、无人统一管」的具体位置**：

- `_pendingScrollLine`：`index.ts:949`（滚动成功清空）、`index.ts:1025`（init 消息写）、`index.ts:1081`（运行期 scrollToLine 写）。三个写点分属三个函数。
- `_savedDoc`：`editor.ts:466`（切序列化模式作废）、`editor.ts:620`（销毁清空）、`editor.ts:640`（保存后更新）、`editor.ts:940`（创建后基准）。四处写，且 `getMarkdownForSave` 依赖它的 null 语义。
- `_hasUnsavedChanges`：`index.ts:428`（文档变更置 true）、`index.ts:708`（初始 false）、`index.ts:1099`（requestContent 置 false）。
- `_isActivePanel`：`index.ts:810`（初值）、`index.ts:965`（init 写入）、`index.ts:1062`（panelActiveState 写入）。
- `headingStickyPlugin.ts:34` 的 `_activeHeadingPos`：只在 `publishActiveHeading` 写（49-53），但 `destroy()`（456-470）不复位、`view()` 初始化时不复位。换文档（revert）后、新文档没有标题时，TOC 可能拿着上一份文档的 pos 调 `applyActiveHeading`（`toc/index.ts:567` 首帧同步）。

**严重度判断**：这些不是「必然 bug」，但 `_savedDoc` 的四处写已直接参与 F3 的竞态；`_activeHeadingPos` 的跨实例残留是可复现的脏状态。

---

## 3. 事件监听与资源生命周期

### 3.1 数量

| 指标 | 数值（源文件，排除测试） |
|---|---|
| `addEventListener` 出现次数 | 142 |
| `removeEventListener` 出现次数 | 32 |
| document/window 级注册 / 移除 | 54 / 24（循环注册的实际实例更多：`userInteraction` 7、`viewportLedger` 6） |
| `new MutationObserver` | 6（其中 4 个无 `disconnect`：codeBlockEnhance 1、topBarDecorations 2、themeBus 1） |
| `new ResizeObserver` | 4（viewportLedger 的 1 个无句柄、永不 disconnect） |
| `setTimeout` / `clearTimeout` | 26 / 23 |
| `requestAnimationFrame` / `cancel` | 26 / 2 |

### 3.2 各组件销毁路径核对

| 组件 | 清理入口 | 监听/资源清理 | 结论 |
|---|---|---|---|
| topBarOverflow | `dispose()` 326-335 | MO/RO/rAF/window resize/menu/按钮全清 | ✅ 范本（还有专门的生命周期测试） |
| headingStickyPlugin | `destroy()` 456-470 | 5 个 window 监听 + 2 个 RO + rAF + timer + DOM | ✅ |
| headingFoldPlugin | `destroy()` 302-306 | view.dom 的 2 个监听 | ✅ |
| frontmatterPanel | `dispose()` 199-203 | 防抖 timer + 面板 | ✅ |
| imagePicker | `close()` 110-113 | 补全 detach + overlay | ✅（但无 Esc、无防重复打开） |
| tableGridPicker | `closeActivePanel()` 14-23 | 3 个监听 + 面板 | ✅（但重建路径不调用，见 F9） |
| imageView NodeView | `destroy()` 667-687 | timer、resize 监听、lightbox | ⚠️ 漏内联编辑 detach（F8） |
| TOC | **无** | — | ❌ 9 个 window 监听 + 1 个订阅（`toc/index.ts:570-581`，返回值 588） |
| findBar | **无** | — | ❌ 8 个监听（207-244，返回值 271） |
| pathLink | **无** | — | ❌ 3 个 document/window（43-64） |
| pathComplete | **无** | — | ❌ 4 个 document/window（126-157） |
| topBarDecorations | **无** | — | ⚠️ 页面级单例，2 个 MO（48-49、63-64）；**不能**在编辑器重建时 dispose |
| codeBlockEnhance | **无** | — | ⚠️ 页面级单例，1 个 MO + 2 个 container 监听（31、106、113） |
| viewportLedger | **无** | — | ⚠️ 页面级单例，6 个 window + 1 个 RO（205-211） |
| userInteraction | **无** | — | 设计为页面级单例，可接受但要标注 |
| themeBus / tooltip / notice | 无 | — | 单例，可接受 |

当前真实泄漏面（不是理论）：

1. **F8**：图片路径内联编辑期间节点销毁 → `imgPathComplete.ts:202` 的 document mousedown 永不摘除，且 `isDestroyed` 仍为 false；若下拉开着，`<ul>` 留在 body 上，直到下一次外部点击由同一套（已泄漏的）关闭逻辑收走。
2. **F9**：表格选择器/图片选择器在 `initEditor` 清容器时没有关闭入口；对比代码块灯箱已被显式清理（`index.ts:416`），说明清理清单是人工枚举、无统一机制。
3. **测试层**：`tocRefresh.test.ts:96,215` 在同一个 jsdom 里 `initToc` 两次 → 第一实例的 9 个 window 监听和 `_activeHeadingListeners` 订阅永远留在 window 上（无 dispose 可选）。

---

## 4. DOM 刮削 / MutationObserver 反模式

### 4.1 直接依赖的上游 class（片段）

```ts
// webview/components/codeBlockEnhance/index.ts
32:  const btn = (e.target as Element).closest('.copy-button') as HTMLElement | null;
43:  const copyBtn = block.querySelector('.copy-button') as HTMLElement | null;
45:  const previewBtn = block.querySelector('.preview-toggle-button') as HTMLElement | null;
49:  const btnGroup = block.querySelector('.tools-button-group');
58:  const cmEditor = block.querySelector('.cm-editor') as HTMLElement | null;
59:  const cmHost = block.querySelector('.codemirror-host') as HTMLElement | null;
60:  const previewPanel = block.querySelector('.preview-panel') as HTMLElement | null;
62:  const langBtn = block.querySelector('.language-button');
104: const scanBlocks = () => container.querySelectorAll('.milkdown-code-block').forEach(addFullscreenBtn);
116: const list = input.closest('.list-wrapper')?.querySelector<HTMLElement>('.language-list');
118: const items = list.querySelectorAll<HTMLElement>('.language-list-item');
```

```ts
// webview/components/topBar/topBarOverflow/index.ts
198: for (const child of Array.from(inner.children) as HTMLElement[]) {
205:     const key = _meta[metaIdx]?.key ?? `__item__${metaIdx}`;
// 按 DOM 顺序给 _meta 编下标，任一新按钮插入即整体错位
```

```ts
// webview/components/topBar/topBarDecorations.ts
36: const items = topBar.querySelectorAll<HTMLElement>('.top-bar-item');
37: items.forEach((item, idx) => {
39:     const text = TOOLTIPS[idx];   // 19 项按 DOM 下标对齐
```

`tech-debt.md` 已登记 codeBlockEnhance / cmThemeObserver / 顶栏耦合三条，本次新增的具体点是：**同一批按钮存在三份清单（F5）**、**`.milkdown-top-bar` 高度计算 7 处（F5）**、**`TOOLTIPS` 用下标而不是 key（F5/F6）**、**4 个 MutationObserver 无 disconnect（F6）**。

### 4.2 用 DOM 身份当所有权

```ts
// webview/components/imageView/index.ts:667-676
destroy(): void {
    if (activeLightbox && document.body.contains(activeLightbox)) {
        const lbImg = activeLightbox.querySelector("img");
        if (lbImg && lbImg.src === img.src) {
            activeLightboxCleanup?.();
        }
    }
```

同一 src 的两张图片（同一图片被引用两次）中任一张销毁，都会按「src 相等」关闭当前灯箱。应改为显式 owner token（如把 cleanup 句柄存在 NodeView 上）。

### 4.3 `innerHTML` 拼接错误文本（安全热点，未验证可利用性）

```ts
// webview/editor.ts:807-810
.catch((err) => {
    console.warn('[mermaid] render failed:', err);
    const e = el();
    if (e) e.innerHTML = `<span style="color:var(--vscode-errorForeground)">Mermaid: ${err}</span>`;
});
```

mermaid 的语法错误 message 常包含用户源码片段；这里把 `err` 直接插入 `innerHTML`。VS Code WebView 默认 CSP 会拦内联事件处理器，所以**是否可执行未验证**（CSP 由宿主注入，属 `src/` 范围）；但至少是未转义拼接，建议改为 `textContent` 或先 `escapeHtml`。现有 `mermaidErrorFallback.test.ts` 只验证「抛错/不画炸弹图」，未覆盖内容转义。

---

## 5. 重复逻辑

### 5.1 浮层脚手架（两处几乎逐行同构）

```ts
// topBarOverflow/index.ts:99-108
function closeMenu(): void {
    _activeMenu?.remove();
    _activeMenu = null;
    if (_onMenuKey) document.removeEventListener("keydown", _onMenuKey);
    if (_onMenuDocMousedown) document.removeEventListener("mousedown", _onMenuDocMousedown, true);
    if (_onMenuScroll) window.removeEventListener("scroll", _onMenuScroll, true);
    ...
}
// topBarOverflow/index.ts:153-162：Escape / 外部 mousedown / scroll 关闭
```

```ts
// tableGridPicker/index.ts:14-23
function closeActivePanel(): void {
    _activePanel?.remove();
    _activePanel = null;
    if (_onKey) document.removeEventListener("keydown", _onKey);
    ...
}
// tableGridPicker/index.ts:97-106：同一套三类监听
```

再加两边的「anchor 下方定位 + 视口 clamp」：`topBarOverflow:136-150` vs `tableGridPicker:58-70`。

### 5.2 灯箱（两套）

`imageView/index.ts:63-114` 与 `codeBlockEnhance/index.ts:65-99` 都是：body 级 overlay → Esc 关闭 → 点遮罩关闭 → cleanup。前者还维护 `activeLightbox/activeLightboxCleanup` 两个模块单例，后者用 `closeOpenLightbox`，语义相同、实现两套。

### 5.3 路径补全残留重复（核心已抽到 `pathCompleteCore`）

| 片段 | 图片路径 | 正文路径 |
|---|---|---|
| 末段文件名 | `imgPathComplete.ts:78-80` | `pathComplete.ts:63`（内联） |
| 图标 + label HTML | `imgPathComplete.ts:62-72` | `pathComplete.ts:59-67` |
| 选中目录后重触发 | `imgPathComplete.ts:104` | `pathComplete.ts:93-96` |

### 5.4 顶栏高度（7 处，写法还不同）

```ts
// index.ts:163 / index.ts:211（完全相同）
const topbarH = document.querySelector(".milkdown-top-bar")?.getBoundingClientRect().height ?? DEFAULT_TOPBAR_HEIGHT;
// index.ts:502-503
const tb = document.querySelector(".milkdown-top-bar") as HTMLElement | null;
const th = tb?.getBoundingClientRect().height ?? DEFAULT_TOPBAR_HEIGHT;
// toc/index.ts:363-364、findBar/index.ts:188、headingStickyPlugin.ts:63-66、vendor/latexFeature.ts:383
```

### 5.5 修饰键状态（两套监听）

```ts
// index.ts:114-120：给 body 加 epytor-modifier-active
document.addEventListener('keydown', (e) => { if (e.ctrlKey || e.metaKey) document.body.classList.add('epytor-modifier-active'); });
// pathLink/index.ts:43-64：自己维护 cmdHeld + Meta/Control + blur
```

### 5.6 scrollToLine 两条分支

`index.ts:1023-1025`（init 路径）与 `index.ts:1079-1082`（运行期路径）都做「写 `_pendingScrollLine` → `applyPendingScrollLine()`」，只是前者多记 `_lastNavLine`。

---

## 6. 死代码（grep / tsc 交叉验证）

### 6.1 真死（全仓零引用）

```
webview/ui/icons.ts:28  export const IconPin
webview/ui/icons.ts:29  export const IconChevronsUp
webview/ui/icons.ts:30  export const IconChevronsDown
```
验证：`Select-String -Path webview,shared,src -Include *.ts -Pattern '\bIconPin\b'` → 1 命中（仅声明）。

### 6.2 未使用 import / 变量（`tsc -p tsconfig.webview.json --noUnusedLocals`）

```
webview/editor.ts(3,5):  error TS6133: 'defaultValueCtx' is declared but its value is never read.
webview/editor.ts(7,5):  error TS6133: 'rootCtx' is declared but its value is never read.
webview/editor.ts(14,5): error TS6133: 'listItemSchema' is declared but its value is never read.
webview/utils/pendingRequest.ts(35,13): error TS6133: 'settleResolve' is declared but its value is never read.
```

（同一命令还报 3 个测试文件的未用变量：`inlineAtomSeparator.test.ts:16`、`tocRefresh.test.ts:171`、`upstreamRegression.test.ts:11`。项目 tsconfig 未开 `noUnusedLocals`，所以 CI 不会报。）

### 6.3 导出面

脚本统计（AST + 全仓词边界匹配，含 `src/`）：

- 总导出 299；**72 个导出只被定义文件内部使用**。最该收窄的：
  - `components/pathLink/fileIcons.ts`：21 个 `svg*` 常量只为同文件 `EXT_MAP`（58-79）服务；
  - `vendor/latexFeature.ts`：15 个内部 schema/const（`mathInlineSchema`、`blockLatexSchema`、`toggleLatexCommand` 等）；
  - `components/topBarOverflow/index.ts:73` `getTopBarUsableWidth`（仅同文件 195 行调用）。
- **33 个导出仅测试引用**（外部无生产调用方），例如：
  - `utils/viewportLedger.ts` 9 个（`isCollapsedViewport`、`isRealTinyViewport`、`nextTinyReal`、`nextLastBodyWidth`、5 个常量）；
  - `components/toc/index.ts` 5 个纯函数（`headingFoldKey`/`assignFoldKeys`/`shouldAutoShowToc`/`resolveTocOpen`/`TOC_AUTO_SHOW_EXTRA_PX`）；
  - `editor.ts:471 getSerializationMode`、`utils/themeBus.ts:23 getThemeListenerCount`、`headingFoldPlugin.ts:36 normalizeFoldPositions`、`utils/headingFold.ts:129 computeAllHeadingFoldRanges`。
  这些是**有意保留的测试 seam**，不应当作死代码删除；建议在文件头注明「@test-only export」或在测试里直接测公共入口。
- 冗余层：`utils/markdownSerializer.ts:128-130` 的 `serializeCleanMarkdown` 只是 `preserveTableBreakStyle` 的转发，而 tech-debt 的「表格 `<br>` 往返闭环（四层）——已确认可拆」条已判定可拆。这是「有测试保护的主动删除」，风险低于普通死代码。

### 6.4 注入但不读的契约字段

```ts
// webview/i18n/index.ts:5-9
__i18n?: {
    translations: Record<string, string>;
    isMac: boolean;
    serializationMode?: SerializationMode;   // ← webview 从不读取
};
```
`src/MarkdownEditorProvider.ts:1081` 会注入它，但实际序列化模式走 `init` 消息里的 `serializationMode`（`index.ts:968`）。两份来源，其中一份死。

---

## 7. 类型逃生

| 类别 | 数量（webview+shared 源文件） | 位置 |
|---|---|---|
| `any` 类型 | **0** | grep `(:\s*any\b\|<any>\|as any\|any\[\])` 无命中 |
| `as any` | **0** | 同上 |
| `as unknown as` | 2 | `editor.ts:108,114`（`undefined as unknown as LanguageSupport`，CodeMirror 语言桩） |
| 非空断言 `!` | 6 | `codeBlockEnhance/index.ts:97`、`findBar/index.ts:137`、`headingStickyPlugin.ts:248`、`ui/tooltip.ts:74`、`utils/headingFold.ts:139`、`vendor/latexFeature.ts:535` |
| `as` 转型 | 94 | 顶部：imageView 14、index.ts 14、latexFeature 9、codeBlockEnhance 8、editor 7；绝大多数是 DOM narrowing（`as HTMLElement`/`as Element`） |

`as unknown as` 的 2 处是可接受的桩，但违反 `LanguageDescription.load()` 的返回契约（返回 `undefined`）：Crepe 若对 `text`/`mermaid` 调用 `load()` 后直接取 `.extension`，会得到 `undefined`。**未验证**（没追 Crepe 7.22.3 内部对 load 结果的处理）。

真正的类型债是 **webview state 没有类型**：

```ts
// messaging.ts:114
export function getWebviewState(): Record<string, unknown> | null
// index.ts:931
const saved = (getWebviewState() as { foldState?: { sig?: string; folded?: number[] } } | null)?.foldState;
// index.ts:1027 / 1031
Number((getWebviewState() as { scrollY?: number } | null)?.scrollY ?? 0)
// index.ts:789
parseSavedSelection((cur as { selection?: unknown }).selection)
// index.ts:996
(msg as { scrollToLine?: number }).scrollToLine === undefined
```

反过来，`toc/index.ts:261-278` 读取同一份 state 时用的是逐字段 `typeof`/`Array.isArray` 守卫——同一份数据两种读取风格。

---

## 8. CSS 组织

### 8.1 规模与 `!important`

| 文件 | 行数 | 规则数 | `!important` 声明 |
|---|---|---|---|
| `webview/style.css` | 1293 | 174 | 138（原文出现 142，含 4 处注释提及） |
| `webview/latex.css` | 142 | — | 8 |
| `webview/components/toc/toc.css` | 271 | — | 2 |
| `webview/components/topBarOverflow/topBarOverflow.css` | 86 | — | 2 |
| `webview/heading.css` | 136 | — | 2 |
| 其余 6 个组件 css | — | — | 0 |
| **全仓** | 13 个 CSS 文件 | — | **152** |

`style.css` 174 条规则里 55 条含 `!important`（32%）；声明级 138/约 600（23%）。`docs/tech-debt.md:75` 记的 142 是 style.css 的原始出现次数，与本次实测一致（声明 138）。

### 8.2 组件样式散在全局文件

| 组件 | 是否有自己的 css | 实际样式位置 |
|---|---|---|
| frontmatterPanel | ❌ | `style.css:37-152`（约 116 行，`.frontmatter-*`/`.fm-*` 各 18 处） |
| codeBlockEnhance | ❌ | `style.css:505-684`（编辑器/工具条/语言下拉）+ `686-762`（全屏灯箱） |
| mermaidZoom | ✅ `mermaidZoom.css` 44 行 | — |
| imageView | ✅ `imageView.css` 337 行 | — |
| TOC | ✅ `toc.css` 271 行 | 另有 2 条折叠期覆盖在 `style.css:235-236` |
| findBar | ✅ `findBar.css` 147 行 | 另有 1 条折叠期覆盖 `style.css:239` |
| topBarOverflow | ✅ 86 行 | 2 条 `display:none !important` |
| headingFold + headingSticky | ⚠️ `heading.css` 136 行 | 由 `headingFoldPlugin.ts:7` import，但 `heading-sticky-*`（63-136）服务的是 `headingStickyPlugin`（它不 import 任何 CSS） |
| latex（vendor） | `latex.css` 142 行 | 由 `index.ts:13` import，不是 vendor 自己 import |
| 列表标记 | `listMarkers.css` 59 行 | 由 `index.ts:15` import，不是 `listMarkerPlugin.ts` import |

**级联耦合证据**：`ui/icons.ts:13` 给每个顶栏图标内联 `style="fill:none!important"`，style.css 里因此有 7 条 `fill: … !important`（851/979/985/1038/1098/1102/1146）。要清这些 `!important`，先要去掉内联那个。

**「跨文件重复规则」的实测结论**（避免误判）：把 13 个 CSS 去掉注释后按选择器建索引，同一个选择器出现在 2 个以上文件的只有 `body` 与 `:root`（toc.css 的 `body` 是 `body.toc-resizing` 前缀规则、`:root` 只定义 TOC 自己的过渡变量；style.css 的 `body` 是全局重置/折叠守卫）——**没有发现逐字重复的声明块**。真正的重复是「同一元素被两处规则共同描述」：折叠期守卫（style.css:233-244 用 `.toc-panel`/`.find-bar` 等组件类名做可见性覆盖）、`heading.css` 同时覆盖 headingFold 与 headingSticky 两个组件、以及 7 条 fill `!important` 与内联 `!important` 的竞争。

### 8.3 可独立落地的两步

1. **迁 frontmatter**：把 `style.css:37-152` 移到 `components/frontmatterPanel/frontmatterPanel.css`，由组件 import。风险点：import 顺序（组件 CSS 晚于 style.css，若同特异性冲突会改结果；frontmatter 选择器唯一，风险低）。验收：`style.test.ts` 全绿 + jsdom 下 frontmatter 输入框/错误态样式断言。
2. **拆代码块样式**：`style.css:505-762` → `components/codeBlockEnhance/codeBlockEnhance.css`，同样由组件 import。验收：`code-block-max-height` 变量消费断言（`style.test.ts:127-129`）与全屏灯箱测试仍通过。

---

## 9. 测试覆盖

### 9.1 现状（可核实的数字）

- `pnpm test`（2026-10-27 本机）：**80 test files / 715 tests 全绿**，264s。
- webview 测试 64 个文件 / 7548 行；另有 4 个 bench 文件 / 296 行。
- **13 个测试文件创建真实编辑器**（`from "../editor"` 或 `import("../editor")`）：headingStickyPlugin、inlineAtomSeparator、latexFeature、listSpread、listSpreadNormalize、saveFidelity、serializationModePersist、tableInlineMathSelect、themeBusLeakProbe、tocClickPin、tocRefresh、undoGranularity、updateNotifyDirtyProbe。所以「只测纯函数」的批评不成立——jsdom 集成测试是有的。
- **但 `webview/index.ts` 零测试**：`Select-String -Path webview/__tests__/*.ts -Pattern '\.\./index'` 无命中（静态与动态 import 均无）。

### 9.2 缺口

| 模块 | 行数 | 直接测试 | 说明 |
|---|---|---|---|
| `webview/index.ts` | 1147 | **0** | 19 种消息路由、init/revert 串行、requestContent、图片上传、焦点/滚动持久化全未测 |
| `components/imageView/index.ts` | 689 | 0 | 仅 `imgPathComplete` 有 6 个用例；NodeView 生命周期、lightbox 无测试 |
| `components/codeBlockEnhance/index.ts` | 150 | 0 | 复制反馈、全屏灯箱、语言下拉键盘导航均无 |
| `components/tableGridPicker/index.ts` | 107 | 0 | 只有纯函数 `tableGrid.test.ts` |
| `components/pathLink/*` | 100+141+158 | 0 | 正文路径 Cmd+Click、路径补全无 |
| `components/imagePicker/index.ts` | 186 | 0 | 上传失败/重试、项目图库、补全 detach 无 |
| `components/topBar/buildTopBar.ts` | 321 | 0 | 上游 group key 假设、列表切换逻辑无 |
| `components/topBar/topBarDecorations.ts` | 65 | 0 | 下标→tooltip 映射无 |
| `components/findBar/index.ts` | 272 | 1 个用例 | 只有「关闭后不搜索」；open/search/next/prev/case/regex 无 |
| `components/frontmatterPanel/index.ts` | 205 | 8 个用例 | ✅ |
| `components/toc/index.ts` | 589 | 6 个文件 | ✅（含真实编辑器 + DOM 断言） |
| `components/topBarOverflow/index.ts` | 337 | 8 个用例（含 dispose 生命周期） | ✅ |

### 9.3 测试反模式：断言源码文本（= 重构阻力）

9 个 webview 测试用 `readFileSync` 读取源文件/ CSS 并断言字符串；**前 7 行**（读 .ts/CSS 的实现文本）会在本报告的拆分中假失败，后 2 行是合理用途（i18n 扫硬编码文案、katexCompat 读 workspace 配置）：

| 测试 | 读取对象 | 断言示例 |
|---|---|---|
| `mermaidErrorFallback.test.ts:22-36` | `webview/editor.ts` | `.initialize(` 恰好 2 次、`toContain("suppressErrorRendering: true")` |
| `latexBubbleBounds.test.ts:18-45` | `vendor/latexFeature.ts`、`utils/bubbleBoundary.ts` | `toContain("placeBubble(")`、`toMatch(/export const BUBBLE_MIN_WIDTH\s*=\s*\d+/)` |
| `bubbleBoundary.test.ts:105-223` | `latexFeature.ts`、`latex.css`、`style.css` | `not.toContain("document.body.appendChild(content)")` |
| `tableInlineMathSelect.test.ts:48,147` | `editor.ts`、`latexFeature.ts` | 源码字符串 |
| `style.test.ts:6-16` | `style.css`、`topBarOverflow.css`、`heading.css` | 选择器/声明存在性 |
| `tocTransitions.test.ts:22` | `toc.css` | 过渡属性 |
| `inlineAtomSeparator.test.ts:107` | CSS | 规则存在性 |
| `katexCompat.test.ts:63` | `pnpm-workspace.yaml` | 版本/overrides |
| `i18n.test.ts:56,90` | 词典 + 全部源码 | 硬编码文案扫描（这条是合理用途） |

前 7 行这类断言在 F1/F2/F12 的拆分中会成片假失败。**重构顺序必须先改测试或同 commit 同步改**，否则「拆完 CI 红」会被误判为行为回归。

---

## 10. 建议的提交序列（每项可独立验收）

| # | commit 主题 | 内容 | 验收 |
|---|---|---|---|
| C1 | `refactor(webview): 顶栏按钮元数据与高度计算单一真源` | 新增 `components/topBar/topBarMeta.ts` + `ui/topbarMetrics.ts`；替换 F5 的 3 份清单/7 处高度 | 新单测：给定 meta 顺序，`findTopBarButtonEl`/tooltip 文案一一对应；`style.test.ts` 不动 |
| C2 | `fix(webview): 图片路径内联编辑在 NodeView 销毁时 detach` | `startToolbarInlineEdit` 返回 cleanup；`createImageView` 保存并在 `destroy()` 调用 | jsdom：创建图片节点→进编辑→销毁→document mousedown 不再触发旧下拉 |
| C3 | `fix(webview): 重建前关闭表格选择器/图片选择器` | 导出 `closeTableGridPicker`/`closeImagePicker`；`initEditor` 清理清单统一 | 重建后 body 无 `.epytor-grid-picker`/`.epytor-img-picker-overlay` |
| C4 | `fix(webview): requestContent 在编辑器重建窗口内不再回旧内容` | `getMarkdownForSave` 可返回 null；requestContent 等生命周期链 | 单测模拟「destroy 后 requestContent」不得回旧 md；revert 全流程 smoke |
| C5 | `refactor(webview): 抽出 scrollSync` | `index.ts:122-249` + `stickyBarHeight` → `utils/scrollSync.ts`；纯几何函数可直接测 | 现有 `headingScroll`/`anchorTarget` 测试不动；新增 `scrollToSourceLine` 边界用例 |
| C6 | `refactor(webview): 抽出 persistence` | `index.ts:752-801` + 三个 timer → `utils/persistence.ts`，`index.ts` 只持句柄 | 滚动/选区持久化行为不变；新增「防抖写入/立即写入」用例 |
| C7 | `refactor(webview): 抽出 mermaidPreview`（先改 F4 的源码文本断言） | `editor.ts:714-812` + 主题回调中的 mermaid 段 → `components/mermaidPreview.ts` | `mermaidErrorFallback` 改为行为断言后全绿；首屏 lazy load 时序不变 |
| C8 | `chore(webview): 清理未使用符号 + 收窄导出` | 3 图标、3 个 import、`settleResolve`、fileIcons/latexFeature 导出；tsconfig 开 `noUnusedLocals`（先修完） | `tsc --noUnusedLocals` 0 错；`pnpm test` 全绿 |
| C9 | `refactor(webview): 消息路由 switch + assertNever` | `handleRegularMessage` 改 switch，未知类型编译期报错；为 C4/F1 铺路 | 新增路由表测试（19 种类型的 handler 被调用/未知类型不抛） |

> 不建议先做：`createImageView` 拆分（452 行但内部已按 ratio/toolbar/edit 分段，收益低于 C1/C5）、`initToc` 拆分（与 DOM 生命周期强耦合，应等 F7 的 dispose 契约先落地）。

---

## 11. 未查证 / 审计限制

1. **未运行 `pnpm run verify`**（只跑了 `pnpm test`，全绿）。`typecheck`/生产构建未跑；`tsc --noUnusedLocals` 是额外诊断，不是项目校验项。
2. **未做真机验证**：F3 的竞态、F9 的残留面板、F6 的 tooltip 错位、§4.3 的 innerHTML 可利用性，均只有代码路径证据；没有在 VS Code Extension Host 里复现。
3. **未审 `src/`**：`src/MarkdownEditorProvider.ts:1081` 只作为「`__i18n.serializationMode` 有注入方」的跨界证据引用，src 内部是否另有读取未核实（grep 全仓仅该处写入）。
4. **上游内部行为未逐版本核对**：`LanguageDescription.load()` 返回 undefined 的后果、Crepe top-bar 的 DOM/group 结构，均依据本仓库注释与选择器推断，未读 7.22.3 源码验证。
5. **性能未量化**：3 个 MutationObserver 每个 keystroke 的 rAF 扫描开销、`initToc.refresh` 在万行文档下的耗时，均未测量。
6. **`git status` 中 1.3.0 未提交改动**未纳入审计判断：本次数字均基于当前工作区；`git diff` 显示 `editor.ts` +102、`index.ts` +76，行数结论会随该批次提交而变化。

---

### 附：本次使用的原始数据

- `TEMP/audit/metrics.json`：文件行数、函数跨度、监听器/定时器/observer 统计
- `TEMP/audit/deadcode.json` / `deadcode-groups.json`：导出符号交叉引用
- `TEMP/audit/type-escapes.json`：非空断言与 `as` 转型明细
- `TEMP/audit/coverage-map.mjs`：测试 import 覆盖矩阵
