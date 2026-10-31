# 项目指令 — epytor

> 本文件按根规范 [`../AGENTS.md`](../AGENTS.md) 的「I 章节标准」组织：九章顺序固定，通用章**原样复用**根规范对应段落（一字不改），项目专属内容写在各章的「本项目」小节与第 9 章。
> 单仓库独立 clone 时读不到根规范，故通用章在此全文复制（根规范 I3：项目 AGENTS 须自含，冗余可接受）。

## 项目概况

VS Code「所见即所得」Markdown 编辑器，基于 Milkdown（Crepe）7.22.3。

* `src/` — Extension 端：`extension.ts`（入口，注册 CustomEditorProvider）、`MarkdownDocument.ts`（文档模型）、`MarkdownEditorProvider.ts`（Provider 核心：面板/消息路由/保存与 revert/frontmatter 编排）、`editor/`（外移的 Provider 职责：`imageMessageHandlers` 图片与路径消息、`externalChange` 外部变更决策与落地、`navigation` 待跳转行、`statusBar` 状态栏、`writeAudit` 写盘审计、`pathLinks` 路径链接、`webviewHtmlBuilder`、`fileWatcher`，全部用显式接口注入而不是互相引用）、`utils/`（路径越界防护、文件名净化、配置净化、行号映射、图片保存、外部变更纯判定、文件大小格式化、**`docPath`（文档相对路径解析的唯一入口）**、`fireAndLog` 等）
* `webview/` — WebView 端按**功能域**分目录：
  * `index.ts`（入口：DOM 脚手架 + 消息路由）、`editor.ts`（CrepeBuilder 装配门面）、`messaging.ts`（双端通道）
  * `app/` — 会话与请求生命周期（`scrollSync` 源码行↔视口几何、`scrollTargets` 延迟滚动与折叠恢复、`persistence` 未落盘推送/滚动/选区持久化、`imageRequests` 上传/图库/重命名、`linkBehavior` 链接行为、`pendingRequest`、`rebuildRestore`、`editorStatePersistence`）
  * `editor/` — 编辑器内核支撑（`editorSession`（编辑器实例 + SavedSnapshot 唯一所有者）、`serialization` 保存归一化纯函数、`continuity` 重建焦点/选区/滚动、`mermaidPreview`、`cmTheme`、`cmThemeObserver`、`compositionGate`、`themeBus`、`bubbleBoundary`、`mermaid`）与 `editor/plugins/`（headingFold / headingSticky / listMarker / softBreakKeymap / cellClickFixPlugin / formatKeymapPlugin）
  * `markdown/` — 序列化与保真（`markdownSerializer`、`minimalDiff`、`listSpread`、`listBackspace`、`listMarker`、`frontmatter`、`emptyTaskListItem`、`taskListItemEnter`）
  * `outline/` — 目录与标题（`headingFold`、`headingSticky`、`headingHighlight`、`headingScroll`）
  * `images/`、`table/`、`code/`、`find/`、`scroll/`、`shell/` — 各自领域的支撑逻辑
  * `components/` — 有独立 DOM 的组件（toc / imageView / findBar / pathLink / tableGridPicker / topBarOverflow / mermaidZoom / frontmatterPanel / codeBlockEnhance / imagePicker / topBar）
  * `ui/` — 通用 UI 原语（icons / tooltip / notice / dom / dropdownComplete / `pathCompleteCore` / `anchoredOverlay`（锚点浮层脚手架）/ `lightbox`（灯箱宿主）/ `modifierKeys`（Ctrl/Meta 唯一来源）/ `topbarMetrics`（顶栏高度的唯一来源））
  * `vendor/` — vendored 上游 feature（latex / virtual-cursor）
* `shared/messages.ts` — Extension ↔ WebView 消息类型契约（**唯一真源**）；`shared/constants.ts`、`shared/tableWrap.ts` — 双端共享常量
* `webview/messaging.ts` — WebView ↔ Extension 的**唯一通道**
* `docs/` — `specs/`（功能 spec）、`checklists/`（手测清单）、`tech-debt.md`（技术债务）、`upstream-limits.md`（上游限制明细）、`audits/`（审计与度量报告）

## 文档规范

### H1｜AGENTS.md〔final〕

中文一份。面向开发 agent，只写规则、契约与做法。

### H2｜README〔final〕

中英双份，英文为默认，顶部互链。面向用户，写安装、使用、配置方式。有已知限制或安全隐患时一并写明。

### H3｜CHANGELOG〔final〕

中英双份，英文为默认，顶部互链。面向用户，每条一项可感知变化。

格式遵循 Keep a Changelog：标题 `## [x.y.z] - YYYY-MM-DD`，从新到旧；日期取发版当日。依赖不进入产物时写明「无用户可感知的变化」。

### 本项目文档清单

* `AGENTS.md`：中文一份；唯一 agent 指令文件（不留 CLAUDE.md 等其它厂商指令文件）
* `README.md` / `README.zh-CN.md`：功能介绍、安装方式、配置项、**已知限制**；面向用户，只写用法与行为，不写实现细节、私有 seam、开发历史
* `CHANGELOG.md` / `CHANGELOG.zh-CN.md`：面向用户，每条 = 一条用户可感知的变化（一句话、行为级）
* `CONTRIBUTING.md` / `CONTRIBUTING.zh-CN.md`：开发环境、提交流程、Bug 报告

## 工程管线

> 以下 E7–E23 原样复用自根规范；紧随其后的「本项目取值与流程」是本项目的具体值。

### E7｜分支约定〔overridable〕

日常改动在 `dev` 分支，默认分支统一为 `main`。例外：B1「开发分支」列为 `main` 的单分支项目直接在 `main` 开发；GitLab 仓库沿用现有分支名。

### E8｜本地一键验证〔interface〕

每个软件项目须提供本地 `verify`，覆盖该项目全部检查项。无构建的仓库以文档自查清单替代，清单写在其 AGENTS。

### E9｜打包产物〔overridable〕

可分发的产物统一放仓库根的 `releases/`，写入 `.gitignore`，确认不进发布包。

输出目录不存在时，打包工具会把目录名当文件名。干净 clone 的仓库没有该目录，须先创建。

不产出可分发包的项目不受本条约束。

### E10｜提交粒度〔final〕

一个 commit 只做一件事。描述用中文，保留英文类型前缀。

### E11｜推送前置条件〔final〕

push 前须 `verify` 通过，推送到开发分支（见 E7）。

### E12｜push 后核查安全告警〔final〕

push 后立即查询一次未处理的 Dependabot 告警，确认清零才继续。存在告警的，先修复再进入发版流程。

### E13｜代码扫描须按扫描周期核查〔final〕

`verify` 通过、CI 全绿，不代表安全扫描无问题。CodeQL 依赖扫描周期，未出结果不得视为通过，须等本轮扫描完成后再查。

依赖类告警按 E22 处理；代码类告警修复后，须等下一轮扫描确认状态变为已修复再发版。

### E14｜发布前审计〔final〕

按 G 段逐条过一遍。

### E15｜准备发布内容〔final〕

两份 CHANGELOG 加新版本条目，改版本号文件，README 有功能变更则同步。多包仓库按包各自维护。

### E16｜合并并推送〔final〕

把开发分支合并到默认分支；单分支项目无需合并。

**tag 触发的项目**：合并后直接推送，进入 E17。

**push 默认分支即部署的项目**：暂不推送，等 E17 批准后再推。

### E17｜发布前须征得 owner 同意〔final〕

发布不可逆，每次执行前都须 owner 明确同意。此前的批准不适用于本次。

### E18｜有告警不得发版（发布硬门禁）〔interface〕

只要存在任一未处理告警（Dependabot / CodeQL / secret scanning），一律不得发版。不得以「告警不在本次改动里」「在测试代码里」「不进发布产物」「与本版无关」为由豁免。

该门禁须由发布工作流 fail-closed 执行（查询告警数，非 0 即中止发布），不得只靠人工核对。告警修复后须等下一轮扫描确认关闭，才算清零。依赖类告警按 E22 处理。

### E19｜打 tag 并推送〔interface〕

一律用 annotated tag 并附说明。push 默认分支即部署、不使用版本号的站点不适用本条。

单次推送不超过 3 个 tag，超过时 GitHub 不生成 push 事件。多包仓库逐个推送，推送后确认 workflow 真的启动。

### E20｜发布凭据〔final〕

发布凭据一律放环境级 secret，仓库级不保留。

### E21｜发布后收尾〔final〕

已发布的版本与 tag 不得覆盖、不得移动。出错只能发新版本修正，且须重新执行 E17 的确认。

发布完成后切回 `dev` 继续开发。单分支项目不适用。

### E22｜依赖维护〔final〕

依赖升级一律手动执行，自动升级按 F3 保持关闭。

运行时依赖或产物依赖单独发补丁版，不与其他改动合并；纯 devDependencies 可并入下个版本。依赖不进产物时 CHANGELOG 写明「无用户可感知的变化」。

### E23｜坏版本处理〔final〕

用 deprecate，不得 unpublish，由 owner 在本机手动执行。无 deprecate 能力的市场只在 README 与 Release 说明里标注已知问题，指向修复版本。

### 本项目取值与流程

* **开发分支**：`dev`；`main` 只接受发布合并
* **验证命令**：`pnpm run verify`（= `typecheck` + `test` + 生产构建）；push 前必须通过
* **本地制品**：`pnpm run package` 固定 `--out releases/`；`releases/` 与 `*.vsix` 进 `.gitignore`、并入 `.vscodeignore`；制品不在仓库根散落，CI / publish 一律按 `releases/*.vsix` 取件
* **提交**：逐项提交，中文描述 + 英文类型前缀（feat: / fix: / refactor: / chore: / docs:）
* **合并**：`dev` → `main`，`--no-ff` 带发布说明
* **运维**：依赖升级统一手动（自动升级与 `dependabot.yml` 保持关闭）；收到警报 → 手动升级 → 按发布流程走补丁版
* **收尾**：发布后切回 `dev`

#### 发布流程（严格按序）

1. **step0 发布确认（硬门禁，owner 当次点头）**：`git tag` / 市场发布等**不可逆的对外发布动作**，执行前必须由 owner **当次明确确认**。「之前批准了整条发布流程」「按你建议走」「继续」**不构成**发布许可；agent 停在发布动作之前，一句话报出「要发什么、版本号、目标通道、影响范围」，未回话即视为未批准（对应 E17）
2. **step1 内容确认（编辑前，逐项展示给用户确认）**：README 中英是否有本次改动；CHANGELOG 中英新版本 section 的完整内容；`docs/specs/` 里相关 spec 是否需标注完成；`package.json` 版本号；合并 commit message；tag annotation 内容
3. **step2 编辑 & 验证**：确认改动已提交到 `dev` → 更新 CHANGELOG 双份（新版本 section 放文件最顶）→ 更新 `package.json` 版本号 → `pnpm run verify`
4. **step3 最终确认**：把实际改动（CHANGELOG diff、版本号、commit message、tag annotation）再展示给用户确认
5. **step4 发布**：`git checkout main && git merge dev --no-ff -m "chore: 合并 dev → main，发布 v<VERSION>"` → `git push origin dev main` → `git tag -a v<VERSION> -m "v<VERSION>: <简述>" && git push origin v<VERSION>` → `git checkout dev`

#### 发布约定（本项目通道）

* publish job 挂 `environment: marketplace-publish`（Deployments 留记录）；**不设审批门禁**（tag 即发布）；**无 release-control**；发布凭据 `VSCE_PAT` 配在该环境级 secret，仓库级不保留
* **发布红线**：已发布版本与 tag 不可覆盖、不可挪动；市场同版本重发被拒——错误只能**发新版本修正**；tag 一律 annotated

## 代码审计

> 以下 G1–G8 原样复用自根规范；「本项目专项检查点」列出本项目最容易出问题的位置。

### G1｜文档对齐〔final〕

文档与实现、声明一一对应。CHANGELOG 覆盖本版本全部可感知改动。

### G2｜死代码〔final〕

导出符号与常量须确认调用方。清理未使用的 import、变量、类型字段、CSS 类。

### G3｜高危缺陷〔final〕

检查状态一致性、竞态、路径与引号处理、资源与内存泄漏、部分失败、环境边界。

「内存泄漏」指：句柄在成功与失败路径均释放；累积状态有界；监听与引用不滞留。

### G4｜安全热点〔final〕

凭据不进日志与 HTML；CSP 与转义；host/client 边界；外部请求带超时；外部 URL 走白名单。

### G5｜代码质量〔final〕

单一职责；状态经函数封装；命名达意；同类对称；不写超长函数与重复逻辑；不散落魔术字符串。

### G6｜容错与性能〔final〕

外部调用带超时与重试；异常输入返回安全默认值；失败路径有用户可见反馈。

重活缓存化或惰性化；热路径不做 O(n²)；大批量渲染分页或虚拟化；高频事件防抖节流；并发扇出有上限。

### G7｜并发与防御〔final〕

UI 入口防连点；请求可被打断且状态保持一致。

### G8｜测试与验证〔final〕

纯逻辑改动须补测试。`verify` 通过，工作区无未提交改动。

### 本项目专项检查点

* **文档对齐**：README 中英 Settings 表与 `package.json` `contributes.configuration` 一一对应；文件路径 / 行为描述与实现一致；CHANGELOG 双份覆盖本版全部用户可感知改动
* **魔法数字**：语义数字（超时 / 防抖间隔 / 阈值 / 步长 / 缓存时长）必须命名常量（`*_MS`）
* **状态一致性**：自动保存 / revert / 消息往返这三条链是最易出竞态的地方——异步动作须由显式状态驱动，动作开始瞬间即置状态，定时器动作结束后清理
* **资源释放**：timer / watcher / `AbortController` / DOM 监听 / 编辑器实例 / webview 消息订阅在**成功与失败路径**都要释放；缓存与累积状态必须有界
* **部分失败**：图片保存 / 上传中途失败时状态要诚实并校验结果，不得留下「看似成功」的半成品
* **环境边界**：首装 / 离线 / 断网 / 权限不足（含 OneDrive 占位符文件读写失败）要降级不挂死、有提示
* **保存保真**：任何改动后都要过「未编辑保存逐字不变」与「编辑后未改动行保持原写法」两条（`saveFidelity.test.ts` 是基线）
* **验证**：`pnpm run verify` 通过 + `git diff --check` 干净

## 安全基线

> 以下 F1–F6 原样复用自根规范；「本项目核验结果」是按 F4 逐项实测的记录。

### F1｜公开仓库全部开启〔final〕

Dependabot alerts（仅报警）、CodeQL default setup、secret scanning 与 push protection、private vulnerability reporting、根目录 `SECURITY.md`。

### F2｜私有仓库仅开启 Dependabot alerts〔final〕

免费计划下其余开关、分支保护与 ruleset 均不可用，记「不可用」不算违规。

### F3｜统一保持关闭〔final〕

secret scanning 的非提供商模式、validity checks、Dependabot 自动升级。

### F4｜逐项核验〔final〕

配置完成与每次变更后逐项核验，结果记录在案；套用 I1 的项目记入其 AGENTS 的安全基线章。

核验项：安全开关各项状态、未处理告警数、CodeQL 状态、私有漏洞报告、`SECURITY.md`、ruleset 清单与规则、合并设置、默认分支的经典保护。私有仓库的分支保护相关项按 F2 记「不可用」。

### F5｜分支保护三层〔final〕

三层指：经典分支保护、ruleset 轻量保护、仓库合并设置。

- **经典保护**：只在此层设「要求对话解决」与「不允许绕过」。不设 required status checks，因会挡住 owner 直推。
- **ruleset**：固定为禁删除、禁强推、禁重建，绕过名单留空。公开仓库的默认分支与 `dev`（如有）各一条。
- **合并设置**：仅开 squash，关闭 merge commit 与 rebase。该项不在 ruleset 也不在安全开关里，最易漏查。

### F6｜直推权限与外部交互〔final〕

owner 保留 fast-forward 直推能力。公开仓库的外部 PR 与 Issue 一律开放，不设交互限制；不接受的直接关闭。

单仓库可按其 AGENTS 登记例外。

### 本项目核验结果（2026-10-27 实测）

| 核验项 | 实际值 | 依据命令 |
| :-- | :-- | :-- |
| 仓库可见性 / 默认分支 | PUBLIC / `main` | `gh repo view peiyucn/epytor` |
| Dependabot alerts 开关 | 已开启 | `gh api repos/peiyucn/epytor/vulnerability-alerts -i`（HTTP 204） |
| 未处理 Dependabot 告警 | **0** | `gh api ".../dependabot/alerts?state=open" --jq length` |
| CodeQL default setup | `configured`；languages `actions, javascript, javascript-typescript, typescript`；`query_suite: default`；**weekly** | `gh api .../code-scanning/default-setup` |
| 未处理代码扫描告警 | **0** | `gh api .../code-scanning/alerts --jq '[.[] \| select(.state=="open")] \| length'` |
| secret scanning / push protection | 均 `enabled` | `gh api repos/peiyucn/epytor --jq .security_and_analysis` |
| private vulnerability reporting | `enabled` | `gh api .../private-vulnerability-reporting` |
| `SECURITY.md` | 存在 | 文件系统 |
| Dependabot 自动升级（F3 要求关闭） | 关闭（无 `.github/dependabot.yml`） | 文件系统 |
| ruleset 清单 | 2 条 active：`默认分支轻保护`、`dev 分支轻保护`；规则均为 `deletion` + `non_fast_forward` + `creation` | `gh api .../rulesets` 及逐条详情 |
| 合并设置 | squash 开、merge commit 关、rebase 关 | `gh api repos/peiyucn/epytor --jq .allow_*` |
| 经典保护（`main`） | `required_conversation_resolution=true`、`enforce_admins=true`、`required_status_checks=null`（按 F5 刻意不设） | `gh api .../branches/main/protection` |

**未查到（不编造）**：secret scanning 的「非提供商模式」与 validity checks 无对应 REST 接口可查，本次未核验；F3 按既有配置假定关闭。

## CI 与自动发布

CI 环节名称按根规范 E24 规定，不得自创；本项目的实际管线为 `typecheck` → `test` → `build` → `package`，发布为 `publish`。

| workflow | 触发 | 环节 | 说明 |
| :-- | :-- | :-- | :-- |
| `ci.yml` | push / PR 到 `main`、`dev` | `typecheck` → `test` → `build` → `package` | `test` 带覆盖率门槛，输出 Vitest Job Summary + 覆盖率 artifact；`package` 产出 VSIX |
| `publish.yml` | push `v*.*.*` tag | `publish` | 单 job：装依赖 → 打包 VSIX（job 内步骤）→ 发布 VS Code Marketplace → 建 GitHub Release（说明拼两份 CHANGELOG 当前版本条目）；job 挂 `environment: marketplace-publish` |

* **发布通道**：VS Code Marketplace（`peiyucn.epytor-vscode`）+ GitHub Release；凭据 `VSCE_PAT` 只放环境级 secret
* **publish 的 vsce 警告是误报**：「249 个文件里 232 个是 JavaScript，建议打包成单文件」——这些 JS 是 `esbuild.mjs` 里 `splitting: true` 产出的**惰性 chunk**（首屏只加载 `webview.js` + `webview.css`，其余按需）。**不要为消这条警告关掉 splitting**，否则会把「6.2MB 单文件、首帧卡顿」的回归带回来（见 `esbuild.mjs` 注释）

## 工具与网络

### D1｜浏览器操作〔final〕

查看自有 GUI、登录态、多步交互、截图，须先在 profile 中挂载 browser use，方可使用浏览器工具。默认未挂载，引擎用本机 Edge。

禁止下载浏览器，本机 Edge 已可用。例外仅限导出 PDF 的脚本自行安装 playwright 依赖。

浏览器产物目录落在调用时的工作目录，已配置全局忽略，无需逐仓库添加。

### D2｜GitHub 操作统一使用 `gh` CLI〔final〕

GitLab 仓库用 `git` 或 `glab`。

### D3｜代理配置〔final〕

git 与 agent 宿主进程均不读取系统代理。需要走代理时须显式指定：git 用一次性参数，宿主进程设环境变量并开启环境代理支持。不写入配置文件。

### 本项目取值

* 仓库：<https://github.com/peiyucn/epytor>（`gh` 已登录 `peiyucn`）
* 非 Bug 的功能讨论引导至 Discussions；Issue 管理细则见第 9 章
* 向上游提 issue 的注意事项见第 9 章「上游限制」

## 工作约定

> 以下 C1–C10 原样复用自根规范。

### C1｜用中文表述〔final〕

与 owner 交流、编写 commit 描述一律用中文，commit 保留英文类型前缀。代码注释以英文为主，写明「为什么」而非复述代码。

### C2｜未知须明示，禁止编造〔final〕

未查到的须标明「未查到」，未验证的须标明「未验证」。禁止编造任何具体信息，不得以确定语气描述未执行的操作。

### C3｜结论须有依据〔final〕

关于当前状态的判断必须取自命令输出或文件内容。推断只能用于提出假设。

### C4｜不用取巧写法〔final〕

禁止用取巧手法让代码跑通。找不到正当解法时停下来说明，不硬过。

### C5｜不隐瞒错误与异常〔final〕

禁止为通过检查而造假，禁止隐瞒缺陷或验证失败。无法修复时如实说明，发现此前结论有误时主动更正。

### C6｜如实说明当前状态〔final〕

进展须区分已实现、已提交、已推送、已发布、已上线验证五级。不得用「完成」笼统概括。

「已上线验证」指 owner 已确认线上正常，agent 无法自行判定。

### C7｜不可逆操作须先经 owner 同意〔final〕

判断标准：执行后能否无损回滚。不能的即为不可逆操作。无法判定时按不可逆处理。

可逆操作直接执行，无需报批。

### C8｜完成后须自检〔final〕

挪动代码后确认旧位置真的没了；说「完成」前逐项核对哪些真做了、哪些没做。

### C9｜修改 AGENTS 须经 owner 许可〔final〕

适用范围：本文件与各项目的 `AGENTS.md`。未经 owner 要求或明确许可，不得修改。

发现需要调整时先提建议，等答复后动手，不擅自扩大范围。

规范须具备约束力：被约束方能随时改动它，约束即不存在。

### C10｜新功能完成后先讨论重构方案〔final〕

功能跑通只是可用，不等于完成。新功能可用后立刻整理一轮重构方案（收敛实现、去重、删死代码、重写命名与注释），**先与 owner 讨论、确认后再执行**；重构行为保持不变，`verify` 保持全绿，且与功能分开提交。未重构的新功能不算完成。

## 项目专属章节

### 扩展与宿主兼容（硬约束）

> 本仓库宿主 = VS Code。以下为项目专属硬约束。

* **版本门走清单，不在 `activate()` 手搓探针**：`package.json` 的 `engines.vscode`（当前 `^1.93.0`）是声明式版本门——VS Code 在激活前自行判定，不满足即不激活；**依赖到新 API 时必须同步抬它**
* **无「格式门」**：本扩展不拥有持久化数据格式（编辑的是用户自己的 md 文件），格式 / 版本门一项不适用
* **停用靠容器**：VS Code 捕获 `activate` 抛出的异常并把扩展标为「激活失败」，不拖垮 VS Code 本体与其它扩展——`activate` 抛错即安全的自停用手段
* **不得带病运行**：不在不认识的契约上做不可逆操作；现有护栏：`src/utils/pathGuard.ts`（路径越界）、`safeBasename.ts`（文件名净化）、`webviewConfigSanitize.ts`（注入 WebView 前净化）
* **运行期不冒泡**：扩展自有入口（webview 消息路由、命令注册、文件监听、DOM 操作）必须内部 try/catch 并记录日志（消息入口另记 `message.type`）；其余自制入口沿用同一口径
* **模块顶层不依赖易变导出**：只用稳定的 `vscode` 命名空间 API，不 import VS Code 内部模块

### 开发

* **包管理器**：必须用 `pnpm`，禁止 npm / yarn
* **语言**：全部 TypeScript；Extension 端 `tsconfig.json`，WebView 端 `tsconfig.webview.json`
* **双目标构建**：`dist/extension.js`（Node.js）+ `dist/webview.js`（Browser），由 `esbuild.mjs` 完成
* **调试**：F5 启动扩展调试实例（`.vscode/launch.json`）
* **spec 先行**：新功能先写 spec（`docs/specs/YYYY-MM-DD-<功能名>.md`：需求范围、交互边界、验收标准）再开发
* **诚实原则**：不确定的事直接说「不确定」，禁止编造 URL、issue 编号、API 接口、文档引用或任何事实性信息
* **优雅原则**：禁止 hack 或补丁式写法，优先用框架 / 库官方 API、CSS 变量、配置回调
* **自检原则**：代码移动 / 提取后**必须**搜索确认旧位置已删除，不留死代码或同名遮蔽；标记 spec 条目完成前逐项列出实际完成项与未完成项，不得把部分完成当整体完成
* **查证原则**：引用文件位置、函数名、调用关系前先 grep 确认，禁止凭记忆编造
* **死代码门禁**：两个 `tsconfig` 已开 `noUnusedLocals` / `noUnusedParameters`，`pnpm run typecheck` 会拦截未使用的 import / 变量 / 参数（测试与 bench 同样受约束；确需保留的未用参数以 `_` 前缀显式豁免）

#### 架构约束

* WebView ↔ Extension 通信**只通过** `webview/messaging.ts` 封装的函数
* WebView 侧不直接 `import` VSCode API，通过 `acquireVsCodeApi()` 获取句柄
* CSS 必须用 `--vscode-*` 变量以适配亮 / 暗主题
* 不在模块外部维护全局状态（单例除外，如 editor view）

#### 配置参考

> 自动保存用 VS Code 内置 `files.autoSave`（off / afterDelay / onFocusChange / onWindowChange），epytor 不提供独立自动保存配置。保存是**拉取式**：webview 变更只发脏标记，保存时（Cmd+S / 原生 autoSave）Extension 发 `requestContent`，webview 序列化一次回传（输入期间零序列化）。

### 测试

| 层次 | 框架 | 适用范围 |
| :--- | :--- | :--- |
| Extension 单元测试 | Vitest 4.x（Node 环境） | `src/**`（`src/utils/`、`MarkdownDocument.ts`，以及 Provider、扩展入口、manifest、配置广播等；`__mocks__/vscode.ts` 提供可实例化的宿主 mock） |
| WebView 单元测试 | Vitest 4.x + jsdom 30.x | `webview/` 各功能域目录（app/、editor/、markdown/、outline/、ui/ 等）、`webview/messaging.ts`、组件纯逻辑与 CSS 结构断言 |
| 集成测试（计划中） | @vscode/test-electron + Mocha | 需真实 VS Code Extension Host |

* `vscode` 模块通过 `__mocks__/vscode.ts` 统一 mock，由 `vitest.config.ts` 的 `resolve.alias` 注入；**禁止**在单个测试文件里 `vi.mock("vscode")`
* 命令：`pnpm test`（一次性）、`pnpm test:watch`（监听）、`pnpm test:coverage`（覆盖率报告）、`pnpm run smoke`（真实产物冒烟，本机 Edge + 构建后的 `dist/`；不依赖 VS Code，失败即退出码非 0）
* 目录：`src/__tests__/`（Node）、`webview/__tests__/`（jsdom，`setup.ts` 注入 `acquireVsCodeApi`）、`shared/__tests__/`、`__mocks__/vscode.ts`
* 命名：文件名以被测模块名为前缀——单文件模块用 `<模块名>.test.ts`；同一模块有多个行为/场景用例时可加场景后缀（如 `tocDispose.test.ts`、`editorSaveBaseline.test.ts`），但前缀必须是被测模块名。结构遵循 AAA，`describe` → `it` 两层；`it` 描述用中文「输入条件 应该 期望结果」

**覆盖率下限**

| 模块 | 行覆盖率 |
| :--- | :--- |
| `src/utils/getNonce.ts` | 100% |
| `src/utils/contentTransform.ts`、`src/utils/lineMap.ts` | ≥ 90% |
| `src/utils/imageService.ts` | ≥ 85% |
| `src/MarkdownDocument.ts` | ≥ 80% |
| **整体（全部生产文件）** | 行 ≥ 70%、函数 ≥ 70% |

> 整体阈值是**防回退基线**，不是目标：阈值 70/70（行/函数）与 `vitest.config.ts` 一致；覆盖率口径为全部生产文件（`src/**`、`webview/**`、`shared/**`，排除测试 / bench / vendor / d.ts）。当前实测记录见 `docs/tech-debt.md`。

**强制流程**（每次代码改动：bug 修复、新功能、重构还债）

* **验证**：`pnpm run verify` 全绿；任一失败先修复，不得跳过
* **人工验收**：输出手测清单（受影响的交互路径与验收点，一行一条、编号排序）→ 用 `vscode_askQuestions` 逐项确认（每屏 ≤4 项，超过分屏）→ 全部通过才进提交；有未通过则修复后从验证重来
* **提交**：通过后方可 `git commit`
* **功能开发后**补单测（核心逻辑、边界值、异常路径各至少一个用例）；**Bug 修复后**先补能复现该 bug 的用例（写在修复同一 commit 内），确认修复前失败、修复后通过
* **禁止**：跳过（`it.skip`）或注释失败的用例让 CI 通过；改测试预期值掩盖 bug（除非实现有意变更且经过评审）；未跑测试就 push 到 `main` / `dev`
* **性能断言**：单测不做挂钟（wall-clock）性能断言（并行与机器负载会随机假红）；性能只在 `*.bench.ts` 里测，单测改用结构断言（块数/顺序/线性契约）
* **Mock 规范**：每个 `describe` 在 `beforeEach` 调 `vi.clearAllMocks()`；文件系统统一 mock `vscode.workspace.fs`（禁止真实 fs 写盘）；依赖时间的逻辑用 `vi.useFakeTimers()` / `vi.useRealTimers()`；禁止测 `private` 方法，通过公共接口验证

### Issue 管理

* 标签：`bug`（已确认的 bug）、`enhancement`（新功能 / 改进），其余用 GitHub 默认标签；**不设自定义标签**——已知限制记在 `docs/upstream-limits.md` + `docs/tech-debt.md`，计划记在讨论结论与 spec，不用标签追
* 规划只在两处留痕：**讨论结论**（Issue / 对话）与 **spec**（`docs/specs/`）；spec 里有对应 issue 就标注编号
* **不用 Issue 模板**：`.github/ISSUE_TEMPLATE/config.yml` 只留 Discussions 入口并保持 `blank_issues_enabled=true`；新 issue 一律空白表单、标签手动打
* **主动提醒用户建 issue** 的时机：发现本次修不了的 bug、有新功能想法但暂不开发、发现需记录的技术债务

### 路线

* 规划方式：**先讨论 → 达成一致 → 写 spec**（`docs/specs/YYYY-MM-DD-<功能名>.md`：需求范围、交互边界、验收标准），spec 落地后才开发
* **不维护路线图文档**：计划只存在于「讨论结论」与「spec」两处，别去维护不存在的清单
* Bug 修复、行为对齐、内部重构不写 spec，按《测试 · 强制流程》走（先补能复现的用例）

### 上游限制

> 明细表见 [`docs/upstream-limits.md`](docs/upstream-limits.md)。

**维护规则**：

* 发现新的上游限制时追加到该表；**只有用户能感知的**才在 README 已知限制里如实写一句（不带 issue 编号——追踪细节留在本表），用户看不见的内部细节不进 README
* 升级依赖版本时对照该表逐项验证，已解决的条目从表中移除，写入 CHANGELOG 的 Fixed
* 优先在对应上游仓库提 issue，将链接填入该表的「追踪」列
* **向上游提 issue 必须遵循对方模板规范**：标题带 `[Bug]` 或 `[Feature]` 前缀，正文结构化（复现步骤 / 期望行为 / 实际行为 / 运行环境）；对方用 `.yml` Issue Forms 时 `gh issue create` 不触发模板校验，需手动对齐字段
