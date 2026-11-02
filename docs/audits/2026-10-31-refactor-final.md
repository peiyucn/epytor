# EPYTOR v1.3.0 重构收尾报告（2026-10-31）

- **仓库 / 分支**：`epytor`，`dev`。代码已提交并推送：`5f14517 refactor: 完成 v1.3.0 重构收尾`、`6e16c0c chore: 升级 @azure/identity 4.14.1 修复 Dependabot #108`；**未打 tag、未发布**。
- **本轮范围**：把三个巨型单元拆完（`MarkdownEditorProvider` / `webview/index.ts` / `webview/editor.ts`），收口 F10（状态所有权）/ F11（重复实现）/ F4（源码文本测试），修掉 9 条遗留缺陷，补自动化与真实产物冒烟，并把覆盖率抬到 73.75%。
- **工作方式**：三个并行编码 teammate（src / webview-core / webview-ui，写范围互斥）+ Lead 集成与全量验证；所有结论以命令输出或测试结果为准；真实 VS Code E2E 见 §10，剩余人工项见 owner 清单。
- **配套文档**：行为变更见 CHANGELOG 双份；剩余债务见 [`../tech-debt.md`](../tech-debt.md)；owner 手测见 [`../checklists/v1.3.0-manual-test.md`](../checklists/v1.3.0-manual-test.md)。

## 结论

1. **结构重构完成**：三个巨型单元全部降到可维护量级，职责按显式接口外移，无循环依赖、公开 API 不变；行为差异仅限下文「有意的行为变更」清单。
2. **自动化显著增强**：测试文件 90 → 110、用例 773 → 967；全量覆盖率 54.8% → **73.75%（行）/ 73.90%（函数）**，阈值从 54/56 上调到 70/70。
3. **验证全绿**：`typecheck`、`verify`（967 用例 + 生产构建）、`test:coverage`、`package`、真实 Edge 冒烟（14/14）、bench（4/4）均通过；`git diff --check` 干净。
4. **剩余项都不是重构尾巴**：2 条需 owner 定口径的保存保真、2 条需真机验证的边界行为、1 条 `!important` 视觉清理、集成测试基建；均已登记在 tech-debt，不阻塞本次提交。

## 1. 结构结果（before → after）

| 单元 | 之前 | 现在 | 目标 | 去向 |
|---|---:|---:|---:|---|
| `src/MarkdownEditorProvider.ts` | 1,480 | **920** | ≤950 | 图片编排 / 外部变更 / 导航 / 状态栏 / 写盘审计 / 路径链接 / HTML 构建 / 文件监听 → `src/editor/*`（8 模块 1,063 行）+ `src/utils/fireAndLog.ts` |
| `webview/index.ts` | 843 | **508** | ≤600 | 内容/滚动/选区持久化 → `app/persistence`；图片请求编排 → `app/imageRequests`；链接行为 → `app/linkBehavior`；延迟滚动与折叠恢复 → `app/scrollTargets` |
| `webview/editor.ts` | 545 | **338** | ≤350 | 实例+保存基线 → `editor/editorSession`（SavedSnapshot）；保存归一化纯函数 → `editor/serialization`；重建连续性 → `editor/continuity`；mermaid → `editor/mermaidPreview`；CodeMirror 主题 → `editor/cmTheme`；格式化快捷键 → `editor/plugins/formatKeymapPlugin` |
| `webview/style.css` | 1,293（本轮前 707） | 707 | — | 组件样式就近迁移已在 10-27 完成；本轮未改 CSS 规则 |
| 文件头号单元（非 vendor） | Provider 1,480 | `components/imageView` 645 / `components/toc` 555 | — | 不再是巨型单元；`latexFeature` 683 为 vendored 上游，不重构 |

**F10 状态所有权**：`SavedSnapshot`（markdown+doc 永不漂移）、`PendingScroll` 对象化；`editor.ts` 模块级 `let` 6 → 0、`index.ts` 16 → 11、全 webview 生产 `let` **53 → 32**（剩余均为已标注的页面级单例）。`headingStickyPlugin.destroy()` 复位当前标题并通知订阅者（owner token 防 Milkdown 异步销毁清掉新实例）。

**F11 重复实现（6 组全部消除）**：`ui/anchoredOverlay`（topBarOverflow + tableGridPicker）、`ui/lightbox`（imageView + codeBlockEnhance）、`pathCompleteCore`（imgPathComplete + pathComplete）、`ui/modifierKeys`（body class + pathLink 同源）、`scrollTargets.applyPendingScrollLine`（两条 scrollToLine 共用）、`topbarMetrics.topbarHeight()`（5 处收敛）。

**F4 源码文本测试**：`tableInlineMathSelect` 改为 4 个真实编辑器行为用例；`componentCssLocality` 改为 CSS 结构 + 模块图断言；`latexBubbleBounds` / `bubbleBoundary` 保留的 vendored/CSS 断言逐处注明理由（jsdom 无布局），未削弱断言。

## 2. 有意的行为变更（全部有回归用例，owner 手测清单对应节）

| # | 变更 | 为什么 | 手测位置 |
|---|---|---|---|
| B1 | 外部变更改为**先读盘再决策**：仅 `adoptDisk` 才更新 document + 发 revert，`defer` 不再提前改模型 | 旧实现先 revert 再判定，defer 期间重建可能仍显示「编辑前」内容 | 清单 §1、§2 |
| B2 | `switchToTextEditor` 走空保存守卫（以真实盘上文本为 `diskText`） | 切源码视图曾可把陈旧缓冲区写回磁盘 | 清单 §1 |
| B2b | `saveCustomDocument` 在「内容==上次写入」时读真实盘上文本再判定 | 内存模型滞后于磁盘时守卫失效 | 清单 §1 |
| B3 | `_handleImageRename` 走 `resolveDocPath` + `normalizeImageDestination` | `@/` 图片重命名曾报 Image not found | 清单 §4 |
| B4 | 无工作区时 `@/` 统一回退文档目录；路径补全保留剩余路径 | 原先文件链接回退父目录、补全丢弃 `@/a/b` 的剩余段 | 清单 §4 |
| A9 | 图库目录读失败回**可见 notice**（l10n 中英） | 原先显示成「没有图片」 | 清单 §4 |
| F10 | 编辑器重建销毁时复位目录当前标题并通知订阅者 | TOC 会继承旧文档的高亮位置 | 清单 §2 |
| A16 | `tableWrapModeChanged.mode` 收窄为 `TableWrapMode` + `normalizeTableWrapMode` | 类型/广播口径统一，无用户可感知变化 | — |

同时修正的缺陷（行为修复，非重构）：defer 重查定时器面板存活守卫、`import("fs")` 补 catch、4 处空 `catch` 改记录日志、`fireAndLog` 统一 3 处 fire-and-forget、`resolveImagePath` 异步 `workspace.fs.stat`、写盘审计 2MB 轮转。

## 3. 自动化证据

| 区域 | 用例 |
|---|---|
| Provider 状态清理/生命周期/消息路由/保存守卫 | `src/__tests__/markdownEditorProvider.test.ts`（21 例，走公共路径，反射枚举全部 per-uri 容器） |
| 外部变更决策/落地 | `src/__tests__/externalChange.test.ts`（10）、`externalChangeDecision.test.ts`（16） |
| 图片消息/路径/重命名 | `src/__tests__/imageMessageHandlers.test.ts`（15）、`docPath.test.ts`（6）、`imageService.test.ts`（53） |
| 导航/状态栏/审计/监听/日志 | `navigation.test.ts`（9）、`statusBar.test.ts`（5）、`writeAudit.test.ts`（6）、`fileWatcher.test.ts`（2）、`fireAndLog.test.ts`（2）、`pathLinks.test.ts`（6） |
| 入口拆分模块 | `contentPush.test.ts`（11）、`imageRequests.test.ts`（14）、`linkBehavior.test.ts`（9）、`scrollTargets.test.ts`（10） |
| 编辑器拆分模块 | `editorSession.test.ts`（8）、`serialization.test.ts`（7）、`continuity.test.ts`（3）、`mermaidPreview.test.ts`（5） |
| 浮层/灯箱/路径补全/修饰键 | `anchoredOverlay.test.ts`（13）、`lightbox.test.ts`（14）、`tableGridPicker.test.ts`（7）、`pathCompleteCore.test.ts`（6）、`modifierKeys.test.ts`（9）、`topBarOverflow.test.ts`（13） |
| 表格公式选择（F4 改造） | `tableInlineMathSelect.test.ts`（4 个真实编辑器行为用例） |
| 真实产物冒烟 | `scripts/smoke-webview/` + `pnpm run smoke`（14 项：启动/渲染/目录/字数/未编辑逐字保存/真实键盘输入序列化/配置 CSS 变量/scrollToLine/选区持久化/revert/懒加载代码块/无页面错误） |

## 4. 命令与结果（2026-10-31，本机）

| 命令 | 结果 |
|---|---|
| `pnpm run typecheck` | exit 0（含 `noUnusedLocals` / `noUnusedParameters`） |
| `pnpm run verify` | exit 0：typecheck + **110 文件 / 967 用例全绿** + 生产构建（`dist` 234 文件 / 7.42MB） |
| `pnpm run test:coverage` | exit 0：行 **73.75%** / 函数 **73.90%**（阈值 70/70） |
| `pnpm run package` | exit 0：`releases/epytor-vscode-1.3.0.vsix`（249 文件 / 2.89MB） |
| `pnpm run smoke` | exit 0：**14/14** 检查通过，0 页面错误 |
| `npx vitest run --config vitest.bench.config.ts` | exit 0：4/4 通过（bench 串行；见 §6） |
| `git diff --check` | exit 0 |

历史对比：HEAD 时测试 80 文件 / 715 例、白名单覆盖率 98.9%（仅 28.2% 生产行）；本轮前 89 文件 / 773 例、全量 54.8%/56.9%。

## 5. 覆盖率构成（为什么能到 73.75%）

- 拆分后 `src/editor/**` 89.8%、`webview/app/**`、`webview/editor/**`、`webview/ui/*` 均可直测；`__mocks__/vscode.ts` 支持 Provider 实例化。
- 仍未覆盖的天然硬点：`webview/index.ts` 0%（入口 DOM 脚手架，由 smoke 覆盖）、`extension.ts` 8.6%（激活 wiring，需 Extension Host 集成测试）、组件视觉分支（需真机）。
- `vitest.config.ts` 阈值 54/56 → **70/70**（约低于实测 3.7 点作防回退基线）；AGENTS 同步。

## 6. 性能基准（探针，手动跑，不进 CI）

机器：本机 Windows；`fileParallelism: false`（本轮加入，避免 bench 互相抢 CPU）。

| 探针 | 结果 |
|---|---|
| `headingFold` 2 万行 / 4000 标题 | 480.8ms（阈值 800ms，O(n²) 回归参考 1.2s；旧阈值 500ms 在 475–565ms 波动，落在噪声带，已按数据调整） |
| `firstRender` ~500 / 2500 / 10000 行 | 1.28s / 3.87s / 17.2s；代码密集 900 / 4500 行 0.71s / 0.39s |
| `scale` 3000 / 10000 行逐键 | avg 2.24ms / 10.59ms |
| `input` 1 万行 100 键 | 总 1.03s，avg 10.25ms/键 |

结论：与拆分前同一数量级，未发现性能回归；bench 不做 CI 断言，数值随机器负载波动。

## 7. 剩余已知项（不阻塞提交；详见 tech-debt）

- 需 owner 定口径：保存保真剩余三条（混合标记符 / `~x~` / GitHub 提示块）、锚点 slug 归一化。
- 需真机验证：折叠光标进出、非激活面板保存是否放开拉取闸门。
- 视觉清理：`!important` 158 处（`style.css` 89）与 link-tooltip 样式段迁移。
- 测试基建：`@vscode/test-electron + Mocha` 集成测试未搭建。
- `DocumentState` 完全对象化（现状 Provider 920 行、状态已按职责外移，收益低，暂缓）。

## 8. 提交记录与交接

- **实际提交**（用户 2026-10-31 要求「先提交一次」，因此合并为两次，未按下面的细分建议）：
  1. `5f14517 refactor: 完成 v1.3.0 重构收尾`（245 文件：结构拆分/F10/F11/缺陷修复/测试/文档）
  2. `6e16c0c chore: 升级 @azure/identity 4.14.1 修复 Dependabot #108`（dev-only 传递依赖）
  3. 后续文档 commit：`docs: 补充真实 VS Code E2E 结果并收敛 owner 手测清单`（本报告 + 清单）
- 均推送到 `origin/dev`；`origin/main` 未动，**未打 tag、未发布**。
- 若以后要恢复「一提交一件事」的粒度，建议按：结构拆分 / F11 / B1-B2b / B3-B4+A9 / 测试与覆盖率 / 工具链 / 文档 拆（本次因用户要求未拆）。
- **交接**：真实 VS Code E2E 已覆盖 14 项（§10）；剩余只能真机/人眼确认的项见 [`../checklists/v1.3.0-manual-test.md`](../checklists/v1.3.0-manual-test.md)（已按自动验证结果收敛）。

## 9. 未验证 / 限制（如实）

- **没有人类视觉/主观判断**：截图与 DOM/computed-style 断言已覆盖大量"能否工作"，但"看起来顺不顺眼、位置是否像素级正确"仍需 owner 看一眼。
- **无法自动覆盖**：真实输入法组词、OneDrive 占位符、多窗口/跨进程抢焦点、Extension Host API 集成测试（依赖未装）。
- **真实 VS Code E2E 已做**（见 §10）：不是"只跑了 jsdom"，但其中 2 项受非前台窗口/测试驱动限制未定论，已列进 owner 清单。
- bench 数字受机器负载影响，只用于数量级对照。
- 提交状态：本报告对应的代码已提交并推到 `dev`（见 §8 的 commit 拆分说明已按用户要求合并为两个 commit）；未打 tag、未发布。

## 10. 真实 VS Code E2E（2026-10-31）

### 怎么做的

- 真实 **VS Code 1.144.0**（本机安装版），扩展用当前工作区构建的 `dist`（`--extensionDevelopmentPath` / 复制 1.3.0 产物到独立 `extensions`），独立临时 profile + 临时 workspace，关闭工作区信任、关闭 Copilot onboarding。
- 用 VS Code 自带的 Chromium 远程调试（`--remote-debugging-port`，通过 CLI 透传）连上 **真实窗口**：
  - workbench 页 target：读状态栏、通知、标签栏、命令面板、源码视图；
  - `type=iframe` 的 `vscode-webview://…extensionId=peiyucn.epytor-vscode` target：进入 webview 内层 execution context，直接读/点真实 Milkdown DOM。
- 输入用 **CDP 真实鼠标/键盘事件**（`Input.dispatchMouseEvent` / `dispatchKeyEvent`，非纯 DOM `.click()`），因此 ProseMirror 真正走事务、`Ctrl+S` 走 VS Code 键位、命令面板真正执行命令；外部改动由 Node 直接写盘。
- 8 个 fixture 文档（标题/列表/表格/公式/代码块/分割线/图片/frontmatter、外部改动、源码切换、`@/` 链接、列表退格）。
- 工具与产物：`TEMP/e2e-vscode/`（临时，未提交），`suite-results.json`、关键截图 `suite-final.png` / `suite-toc.png` / `t4.png` 等；测试结束已关闭全部 E2E VS Code 进程。

### 结果：14/16

| # | 通过项 | 说明 |
|---|---|---|
| A1 | 启动/渲染/状态栏 | 标题、列表、表格、代码块齐全；`Lines(src): 25 Words: 71 Chars: 85 Size: 415 B` |
| A2 | KaTeX | 2 个公式节点 |
| A3 | `@/` 图片 | `image-node` 加载，512×512 |
| A4 | 分割线 | computed height `1px` |
| A5 | 状态栏 Size | 415 B，与磁盘一致 |
| A6 | 未编辑保存 | 前后逐字一致（68 chars） |
| A7 | 编辑后保存 | 落盘且未改动的列表/代码块原样保留 |
| A8 | 外部改动（有未保存编辑） | 真实通知 + 编辑器内容保留 |
| A9 | 同场景 Ctrl+S | 按警告语义覆盖磁盘 |
| A10 | 源码视图往返 | `EPYTOR OFF` 内容正确；`EPYTOR ON` webview 重新挂载 |
| A11 | `@/` 链接 Ctrl+点击 | 打开 `note.md`，仍用 epytor |
| A12 | 状态栏 Size 随外部改动 | 56 B → 4.4 KB |
| A13 | TOC | 展开后 6 个 `.toc-item` |
| A14 | Reload Window | webview 重新挂载；滚动位置 500 → 274（恢复，非归零） |

**2 项未定论**：
1. **外部改动 + 无编辑时自动重建**：harness 里扩展走 defer 路径（显示同款"内容已保留"警告），而截图表明内容在后续交互后会更新；无法区分"面板非前台导致的合理 defer"与产品问题，留给 owner 真机确认。
2. **亮色主题实时切换**：通过直接改 `settings.json` 未在运行中实时生效（拍到仍暗色），判断是测试驱动方式问题，未算产品失败；owner 用命令面板切一次即可确认。

### 附带发现（待 owner 真机确认）

- `Developer: Reload Window` 后截图里，编辑器左上角曾出现一个灰底浮层，内容为源码行（`# E2E 测试文档` / `## 列表` / `132 —`）。可能是重载竞态下的临时瞬态，也可能是吸顶/TOC 浮层残留。请 reload 后留意是否复现；若稳定复现，把现象发我。

### 这套 E2E 覆盖不到什么

- 真实输入法组词、OneDrive/占位符、多窗口/跨窗口焦点、拖拽、像素级视觉与主题观感、真实图床/上传、Extension Host API 级集成。
- 本次 harness 依赖本机 VS Code 的远程调试开关，属于临时验证工具（`TEMP/`，未提交）；若以后要长期化，可把它整理成 `scripts/e2e-vscode/` 的正式工具并接入 CI（当前不做）。

### 第二轮 E2E（组件 / 主题 / 长文，2026-10-31 下午）

在第一轮基础上补了 13 项真实窗口交互：

| # | 验证点 | 结果 |
|---|---|---|
| B1 | 顶栏按钮 tooltip 注入（真实 hover 扫描） | 14 个按钮标签可读 |
| B2 | 表格网格选择器：打开、64 格、Esc 关闭、重复打开不叠层 | 通过 |
| B3 | 图片选择器：打开、点外部关闭 | 通过；**Esc 未接线**（组件只有外部点击/选择/关闭按钮） |
| B4 | 代码块全屏：打开、内容显示、Esc 关闭 | 通过 |
| B5 | 图片灯箱：工具栏放大打开、Esc 关闭 | 通过 |
| B6 | `@/` 图片改名：文件改名 + 编辑器 src 更新 + 保存后 markdown 更新 | 通过（独立 focused probe；套件内受前序浮层状态影响未计入 12/13） |
| B7 | 目录面板开合 + 6 个标题项 | 通过 |
| B8 | 亮色主题（真实 Color Theme 命令）webview 跟随 | 通过（webview `vscode-light` + CSS 变量） |
| B9 | mermaid 渲染为 SVG | 通过（37 个 SVG 节点） |
| B10 | 长文：42 个 TOC 项、滚动后吸顶标题 + 当前项高亮 | 通过 |
| B11 | 窄窗口：顶栏进入溢出（28 隐藏项 + ⋯ 可见） | 通过；菜单项点击行为未验 |
| B12 | 状态栏 Size：保存后与磁盘一致；文件删除后 Size 段消失 | 通过 |
| B13 | 外部改动：同一文档只警告一次 | 通过 |

**新发现**：图片选择器没有 Escape 关闭逻辑（`webview/components/imagePicker/index.ts` 只有 overlay mousedown / tab / 选择时 close）。清单此前的「Esc 关闭」需 owner 定口径；若要求支持，补一个 keydown 监听即可（本轮未改功能）。

**第二轮仍然证实不了**：外部改动 + 无编辑的实时自动重建（非前台窗口下扩展走 defer 路径，与第一轮一致）；需真机前台验证。

**工具状态**：harness 位于 `TEMP/e2e-vscode/`（临时，未提交）；`suite-results.json`（第一轮 14/16）、`suite2-results.json`（第二轮 12/13）与截图可复看。测试结束已关闭全部 E2E VS Code 进程。

### 第三轮 E2E（列表 / 溢出 / 自动保存 / 工作区外）——发现并修复一个真 bug

| # | 验证点 | 结果 |
|---|---|---|
| C1 | 松散列表：编辑某项后，项与项之间的空行保留 | 通过 |
| C2 | 顶栏溢出菜单：窄窗口可打开（20 项）、Esc 关闭 | 通过；菜单项点击执行未验 |
| C3 | 目录连续开合 10 次 | 通过（6 项稳定） |
| C4 | `onFocusChange`：编辑后切标签自动落盘 | 通过 |
| C5 | 真实命令 `File: Toggle Auto Save` 开启后打字自动落盘 | 通过 |
| C6 | 工作区外独立 `.md` 的 `@/` 图片/链接 | **原实现有 bug**，修复后真机复测通过 |
| C7 | 后台面板外部改动：切回后警告 | 警告出现，但编辑器显示磁盘内容（疑似失活时已 flush）；待确认期望 |
| C8 | 嵌套列表退格 | E2E 点击定位不稳，无法下结论；需真机 |

**C6 的 bug 与修复**：

- 现象：VS Code 已打开一个 workspace，再打开一个**不在该 workspace 内**的独立 `.md`；其中 `![x](@/pic.png)` 被解析成 `workspace 根/pic.png`（404），`Ctrl+点击 @/note.md` 也落到 workspace 根。根因是多处保留了「文档不属于任何 workspace 时借用第一个 workspace 根」的回退：
  - `src/utils/docPath.ts` 的 `resolveWorkspaceRoot`
  - `src/editor/pathLinks.ts` 打开链接路径
  - `src/MarkdownEditorProvider.ts` 的 `_prepareContentForDisplay`（图片显示 URI 映射）
  - `src/editor/imageMessageHandlers.ts` 的路径补全
- 修复：全部改为「只认文档所属的 workspace 文件夹；不属于任何文件夹就返回 null，让 `@/` 回退文档目录」，与 B4 的口径一致；新增 `docPath` / `pathLinks` 回归用例（969 例全绿）。
- 真实 VS Code 复测：独立文件中的 `@/pic.png` 解析到 `outside/pic.png`（naturalWidth>0），`Ctrl+点击 @/note.md` 打开目标文件；截图 `TEMP/e2e-vscode/fix-outside-verified.png`。

**第三轮结论**：真实窗口交互继续覆盖组件层；**发现并修复了 1 个此前单测覆盖不到的真 bug**。C7/C8 需要真机用真实鼠标/键盘复核。

### 第四轮 E2E（目录跳转 / 图片路径 / 搜索，2026-10-31 深夜）

| # | 验证点 | 结果 |
|---|---|---|
| D1 | TOC 点击条目：跳转并高亮该项 | 通过（scrollY=362.5，active=1） |
| D2 | 图片路径内联编辑：铅笔按钮 → 输入 `./` → 3 条补全 → Esc 关闭 | 通过；撤销图片时的残留清理未验 |
| D3 | `Ctrl+Shift+F` 搜索命中并打开文档 | 通过（2 条结果，Enter 打开 test.md） |
| D4 | 编辑后关闭脏标签时的保存对话框 | 未定论：合成的 Ctrl+W / 命令面板关闭未触发对话框，需真实键鼠复核（可能是测试驱动问题） |

第三轮发现的工作区外 `@/` 解析 bug 已落地：`8894911 fix: 工作区外文档的 @/ 路径按文档目录解析`（含 docPath/pathLinks 回归用例；全量 969 例、真实 VS Code 复测均通过）。

**第四轮结论**：又自动化掉 3 项清单（目录跳转、图片路径补全、全局搜索），D4 留给真机。清单剩余项已压缩到 20 项左右，主要是真机输入法/OneDrive/多窗口/视觉/上传类，以及背景面板等 2 个待确认行为。

### 第五轮 E2E（Revert / 重建浮层 / 移图错误，2026-10-31 深夜）

| # | 验证点 | 结果 |
|---|---|---|
| E1 | `File: Revert File`：外部改动警告后，命令载入磁盘版本 | 通过（编辑器显示磁盘内容，未保存编辑不残留） |
| E2 | 重建时浮层关闭：打开表格网格选择器 → Reload Window → picker 消失 | 通过 |
| E3 | 外部移走图片后改名：错误提示可见、无半成品文件 | 通过 |
| E4 | 脏标签关闭对话框 | 未定论：真实鼠标点标签 ×、Ctrl+W、精确命令面板都未触发对话框，需真机复核（可能是驱动/焦点问题） |
| E5 | `--locale=zh-cn` 中文状态栏标签 | 未定论：CLI 传 locale 未生效（可能需 argv.json），需真机切语言后确认 |

**第五轮结论**：Revert 方向、重建关浮层、移图错误提示三项通过；剩余自动化瓶颈主要是「脏标签关闭对话框」和「中英 locale」——两者都依赖真实键鼠/真实语言环境，建议 owner 手测。

**清单现状**：已自动验证 29+ 项，剩余约 18 项，绝大多数是 OneDrive/输入法/多窗口/视觉/上传等真机项，以及 image picker Esc、后台面板外部改动等需要 owner 拍板的行为。
