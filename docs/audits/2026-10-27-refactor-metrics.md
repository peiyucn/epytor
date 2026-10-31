# EPYTOR 客观度量报告（只读审计）
> **基线说明（2026-10-29 补）**：本报告的路径 / 行号 / 文件大小均为 2026-10-27 重构前快照；重构后 `webview/utils/` 已按功能域拆到 `webview/app/`、`editor/`、`markdown/` 等目录，行号可能失效，结论以 `docs/tech-debt.md` 的最新记录为准。

- 仓库：`C:\Users\DJ028191\pyai-meta-repo\epytor`
- 分支 / 提交：`dev` / `252b647`（2026-10-22）
- 审计时工作区：21 个已修改 + 11 个未跟踪文件；**审计未改动源码**。测试重写了 `coverage/`、构建重写了 `dist/`，二者均被 `.gitignore` 忽略。
- 环境：Windows，Node `v24.19.0`，pnpm `10.6.1`，TypeScript `5.9.3`，Vitest `4.1.12`，esbuild `0.28.1`
- 实测时间：2026-10-27 15:46–16:10（Asia/Shanghai）

**口径总说明**

1. 行数 = 换行符数量（文件末尾无换行补 1），与编辑器行号、`(Get-Content $f).Count` 一致。
2. TS 统计**排除** `webview/global.d.ts`（2 行，纯声明）；TSX 文件为 0。未跟踪的新文件计入。
3. “测试文件/测试行”按路径含 `/__tests__/` 判定，因此 `webview/__tests__/setup.ts` 等辅助文件也计入测试行。
4. 唯一属于“估算”的是第 4 节重复块（规范化文本匹配）与第 5 节“无同名测试文件”映射（文件名启发式）；第 2 节为 TypeScript AST 语法边界实测，不是行数估算。

## 关键数字速览

| # | 指标 | 数值 |
|---|---|---|
| 1 | TS/TSX/CSS 总量 | **26,873 行 / 181 文件**（另有 `global.d.ts` 2 行未计；TSX 0） |
| 2 | 生产代码 vs 测试代码 | **16,570 行 vs 10,303 行**（测试占 38.3%） |
| 3 | 最大文件 | `src/MarkdownEditorProvider.ts` **1,466 行**（第二名 `webview/style.css` 1,293 行的 1.13 倍） |
| 4 | 大文件计数（含 CSS） | **>500 行：8 个**（生产 7）；**>300 行：20 个**（生产 13） |
| 5 | 最长函数 / 函数总量 | `initToc` **472 行**（占所在文件 589 行的 80.1%）；函数节点 2,758 个，>100 行 39 个 |
| 6 | 类型逃逸 | `: any` **0**、`as any` **0**、`as unknown as` **116**（测试 113）；非空断言 **205**（测试 199） |
| 7 | 重复代码 | 121 组 6 行窗口 → **358 个两两重复块**（测试之间 351；生产相关 7 块 / 71 行） |
| 8 | 测试与覆盖率 | **80 个测试文件 / 715 个用例**；行 **98.92%**、函数 **97.93%**（白名单 46/83 个生产 TS 文件） |
| 9 | 依赖与安装体积 | **17 个 prod + 10 个 dev**（另 13 个 overrides）；`node_modules` **365.25 MiB**，768 个包版本目录 |
| 10 | 构建 / 产物 | `pnpm run build` **396.08 s**；生产 dist **7.40 MiB / 234 文件**，dev 构建 **35.30 MiB / 468 文件** |

---

## 1. 体积分布

### 1.1 目录汇总

| 目录 | 文件数 | TS/TSX 行 | CSS 行 | 合计行 | 其中测试行 | 生产行 |
|---|---:|---:|---:|---:|---:|---:|
| `src/` | 32 | 5,428 | 0 | 5,428 | 2,393 | 3,035 |
| `webview/` | 145 | 18,567 | 2,714 | 21,281 | 7,877 | 13,404 |
| `shared/` | 4 | 164 | 0 | 164 | 33 | 131 |
| **合计** | **181** | **24,159** | **2,714** | **26,873** | **10,303** | **16,570** |

- `webview` 的生产 13,404 行中含 CSS 2,714 行，故生产 TS 行为 10,690。
- 全仓生产 TS 行 = 3,035 + 10,690 + 131 = **13,856 行**。
- `webview/` 文件数 = 132 个 `.ts` + 13 个 `.css`；`webview/global.d.ts` 未计入。

复跑命令：

```powershell
cd C:\Users\DJ028191\pyai-meta-repo\epytor
node C:\Users\DJ028191\pyai-meta-repo\TEMP\audit\scan.mjs   # 明细写入 TEMP\audit\scan.json
# 独立复算（不依赖脚本）：
Get-ChildItem src,webview,shared -Recurse -File |
  Where-Object { $_.Extension -in '.ts','.tsx','.css' -and $_.Name -notlike '*.d.ts' } |
  ForEach-Object { [pscustomobject]@{ Lines=(Get-Content $_.FullName).Count; Path=$_.FullName } } |
  Sort-Object Lines -Descending | Select-Object -First 20
```

### 1.2 行数 Top 20

| # | 行数 | 文件 | 目录 | 类型 |
|---:|---:|---|---|---|
| 1 | 1,466 | `src/MarkdownEditorProvider.ts` | src | 生产 TS |
| 2 | 1,293 | `webview/style.css` | webview | 生产 CSS |
| 3 | 1,147 | `webview/index.ts` | webview | 生产 TS |
| 4 | 942 | `webview/editor.ts` | webview | 生产 TS |
| 5 | 689 | `webview/components/imageView/index.ts` | webview | 生产 TS |
| 6 | 683 | `webview/vendor/latexFeature.ts` | webview | 生产 TS |
| 7 | 599 | `src/__tests__/imageService.test.ts` | src | 测试 |
| 8 | 589 | `webview/components/toc/index.ts` | webview | 生产 TS |
| 9 | 474 | `webview/headingStickyPlugin.ts` | webview | 生产 TS |
| 10 | 460 | `src/__tests__/contentTransform.test.ts` | src | 测试 |
| 11 | 382 | `webview/__tests__/headingStickyPlugin.test.ts` | webview | 测试 |
| 12 | 367 | `webview/__tests__/style.test.ts` | webview | 测试 |
| 13 | 342 | `webview/__tests__/viewportLedger.test.ts` | webview | 测试 |
| 14 | 337 | `webview/components/topBarOverflow/index.ts` | webview | 生产 TS |
| 15 | 337 | `webview/components/imageView/imageView.css` | webview | 生产 CSS |
| 16 | 327 | `webview/utils/markdownSerializer.ts` | webview | 生产 TS |
| 17 | 321 | `webview/components/topBar/buildTopBar.ts` | webview | 生产 TS |
| 18 | 310 | `webview/headingFoldPlugin.ts` | webview | 生产 TS |
| 19 | 309 | `src/__tests__/imageServerConfig.test.ts` | src | 测试 |
| 20 | 308 | `webview/__tests__/tocRefresh.test.ts` | webview | 测试 |

- Top 20 的目录分布：**src 4 个、webview 16 个、shared 0 个**。
- Top 20 中测试文件 7 个，生产文件 13 个。
- 头部集中度：Top 1 占全仓 26,873 行的 5.46%；Top 10 合计 8,342 行，占 31.0%。

### 1.3 行数阈值

| 阈值（严格 `>`） | 总数 | 其中生产 | 其中测试 |
|---|---:|---:|---:|
| > 500 行 | 8 | 7 | 1（`src/__tests__/imageService.test.ts`） |
| > 300 行 | 20 | 13 | 7 |

- 若只看 TS（排除 13 个 CSS）：>500 行为 7 个、>300 行为 18 个。
- CSS 内部集中度：`style.css` 1,293 行，占全部 CSS 2,714 行的 **47.6%**；第二名 `imageView.css` 337 行。

---

## 2. 函数粒度

### 2.1 口径

- 工具：项目内 TypeScript 5.9.3 Compiler API，`ts.createSourceFile` **全量解析** 168 个 `.ts`（不含 `.d.ts`），解析错误 **0**。
- 节点：`FunctionDeclaration`、`FunctionExpression`、`ArrowFunction`、`MethodDeclaration`、`Constructor`、`Get/SetAccessor`。
- 行数 = `node.getStart()` 到 `node.end()` 的**含首尾行跨度**（含函数内注释、空行）。
- **嵌套重复计数**：父函数跨度包含子函数体。例如 `headingStickyPlugin.ts:83-473` 的 `$prose` 回调包含 `:85-472` 的 `view` 方法，两者都在榜内；`describe(...)` 回调包含其内部所有 `it(...)` 回调。
- 箭头函数从参数起点算起，不含左侧 `const name =` 的声明行。因此这是“语法节点跨度”，不是“独立逻辑行数”；行号本身无估算误差。

### 2.2 全仓 Top 15（含测试）

| # | 行数 | 文件:起止行 | 名称 | 节点 / 备注 |
|---:|---:|---|---|---|
| 1 | 472 | `webview/components/toc/index.ts:118-589` | `initToc` | Function / 生产 |
| 2 | 452 | `webview/components/imageView/index.ts:238-689` | `createImageView` | Function / 生产 |
| 3 | 391 | `webview/headingStickyPlugin.ts:83-473` | `<callback:$prose>` | Arrow / 生产，包装 #4 |
| 4 | 388 | `webview/headingStickyPlugin.ts:85-472` | `view` | Method / 生产，#3 的内层 |
| 5 | 322 | `webview/__tests__/style.test.ts:46-367` | `<callback:describe>` | Arrow / 测试 |
| 6 | 299 | `webview/editor.ts:644-942` | `createEditor` | Function / 生产 |
| 7 | 293 | `webview/components/topBar/buildTopBar.ts:29-321` | `buildTopBarConfig` | Function / 生产 |
| 8 | 248 | `webview/components/findBar/index.ts:25-272` | `initFindBar` | Function / 生产 |
| 9 | 244 | `webview/__tests__/headingStickyPlugin.test.ts:139-382` | `<callback:describe>` | Arrow / 测试 |
| 10 | 231 | `src/MarkdownEditorProvider.ts:608-838` | `MarkdownEditorProvider._handleWebviewMessage` | Method / 生产 |
| 11 | 231 | `webview/editor.ts:180-410` | `<callback:$prose>` | Arrow / 生产 |
| 12 | 202 | `webview/__tests__/markdownSerializer.test.ts:44-245` | `<callback:describe>` | Arrow / 测试 |
| 13 | 189 | `webview/components/frontmatterPanel/index.ts:17-205` | `createFrontmatterPanel` | Function / 生产 |
| 14 | 180 | `webview/__tests__/tocRefresh.test.ts:129-308` | `<callback:describe>` | Arrow / 测试 |
| 15 | 178 | `webview/components/imagePicker/index.ts:9-186` | `showImagePicker` | Function / 生产 |

生产代码（剔除 `__tests__`）最长前 5：`initToc` 472、`createImageView` 452、`view` 388、`createEditor` 299、`buildTopBarConfig` 293。

### 2.3 函数规模计数

| 指标 | 数量 |
|---|---:|
| 函数/方法/回调节点总数 | 2,758 |
| 跨度 > 100 行 | 39 |
| 跨度 > 200 行 | 12 |
| 单文件函数数最多 | `webview/index.ts`（95 个节点） |

复跑命令：`node C:\Users\DJ028191\pyai-meta-repo\TEMP\audit\scan.mjs`（函数明细在 `scan.json.functions`）。

---

## 3. 可疑代码计数

### 3.1 汇总

| 类别 | 总数 | 生产 | 测试/bench | 文件分布 Top 5（次数） |
|---|---:|---:|---:|---|
| `: any` 类型注解 | **0** | 0 | 0 | — |
| `as any` | **0** | 0 | 0 | — |
| `as unknown as` | **116** | 3 | 113 | headingStickyPlugin.test 9、tocRefresh 8、tocClickPin 6、firstRender.bench 5、inlineAtomSeparator 5 |
| 非空断言 `!` | **205** | 6 | 199 | style.test 38、listSpread.test 35、listSpreadNormalize.test 24、frontmatterPanel.test 21、headingStickyPlugin.test 17 |
| `@ts-ignore` | **0** | 0 | 0 | — |
| `@ts-expect-error` | **0** | 0 | 0 | — |
| `eslint-disable*` | **5** | 0 | 5 | 全部为 4 个 bench 文件的 `no-console`（firstRender :81、headingFold :53、input :62、scale :72/:75） |
| `TODO` | **2** | 2 | 0 | `MarkdownEditorProvider.ts:889,890`（`undo/redo` 内 `/* TODO */`） |
| `FIXME` / `XXX` / `HACK` | **0 / 0 / 0** | 0 | 0 | — |
| 内联时长字面量（`setTimeout/setInterval` 第 2 参） | **20** | 1 | 19 | tocRefresh.test 12、tocClickPin.test 4、headingStickyPlugin.test 2、codeBlockEnhance 1、cellClickState.test 1 |
| 命名的时长常量（名字含 ms/delay/timeout/… 且值 >0） | **37** | 30 | 7 | webview/index.ts 9、pendingRequest.test 7、MarkdownEditorProvider.ts 5、shared/constants.ts 3、imgPathComplete.ts 2 |
| CSS 时长字面量（`0.15s` 等） | **37** | 37 | 0 | style.css 13、toc.css 12、imageView.css 4、findBar 2、latex 2 |

口径说明：

- `: any` / `as any` / `as unknown as` / 非空断言用 AST 精确计数：`AnyKeyword` 类型节点、`AsExpression`、`NonNullExpression`。
- `!` 只统计非空断言节点，`!==`、`!=`、`!expr`（逻辑非）不计入；因此 205 是**语法级精确值**，不是正则估算。
- `@ts-*`、`eslint-disable`、`TODO/FIXME/XXX/HACK` 用全文正则（大小写敏感、词边界）。
- 魔法数字口径：A) 直接写在 `setTimeout/setInterval` 第二参数的数字字面量（典型硬编码）；B) 变量/属性名含时长语义且初值为数字常量（已命名，但值仍硬编码）；C) CSS 里的 `ms/s` 时间值。A、B 分别计数，不合并。`magic` 原始数组 61 条 = A 20 + B（值 >0）37 + 值为 0 的命名项 4（如 `debounce: 0`、`maxMs = 0`，单列不计入上表）。

### 3.2 非空断言 `!`：生产 6 处全列

```
webview/components/codeBlockEnhance/index.ts:97   lb.querySelector('.epytor-fs-close')!
webview/components/findBar/index.ts:137            node.textContent!
webview/headingStickyPlugin.ts:248                 pending.pop()!
webview/ui/tooltip.ts:74                           horizontal.right!
webview/utils/headingFold.ts:139                   stack.pop()!
webview/vendor/latexFeature.ts:535                 schema.nodes.paragraph!
```

测试文件前 30 条（文件:行）：

```
webview/__tests__/style.test.ts:68,79,81,83,162,163,175,203,219,220,221,223,224,230,233,234,242,248,257,258,268,271,279,280,282,283,289,294,295,304
```

（其余按文件汇总：listSpread 35、listSpreadNormalize 24、frontmatterPanel 21、headingStickyPlugin 17、latexFeature 7、tocTransitions 7、其余 ≤6；完整 205 条在 `scan.json.suspicious.nonNull`。）

### 3.3 `as unknown as`：生产 3 处全列

```
src/utils/lineMap.ts:50       parser.parse(content) as unknown as { children: MdastTopLevelNode[] }
webview/editor.ts:108         undefined as unknown as LanguageSupport
webview/editor.ts:114         undefined as unknown as LanguageSupport
```

测试侧 113 处，前 30 条：

```
webview/__tests__/headingStickyPlugin.test.ts:14,15,27,57,57,69,69,72,191
webview/__tests__/tocRefresh.test.ts:18,19,31,36,37,231,268,293
webview/__tests__/tocClickPin.test.ts:18,19,31,34,35,102
webview/__tests__/firstRender.bench.ts:10,11,23,24,28
webview/__tests__/inlineAtomSeparator.test.ts:29,30,34,35,39
webview/__tests__/latexFeature.test.ts:40,41,53,54,58
webview/__tests__/listSpread.test.ts:5,6,8,9,14
webview/__tests__/listSpreadNormalize.test.ts:7,8,10,11,16
webview/__tests__/serializationModePersist.test.ts:10,11,15,16,29
webview/__tests__/undoGranularity.test.ts:7,8,10,11,16
webview/__tests__/listDefaultBehavior.test.ts:14,15,48,129
...
```

### 3.4 硬编码时长：明细

内联 `setTimeout/setInterval`（20 处）：生产仅 1 处 `webview/components/codeBlockEnhance/index.ts:38`（100ms）；其余 19 处分布在测试：`tocRefresh.test.ts:120,145,160,175,184,199,237,246,251,270,295,300`、`tocClickPin.test.ts:91,93,113,133`、`headingStickyPlugin.test.ts:58,133`、`cellClickState.test.ts:56`。

命名时长常量（37 处，行号）：

```
webview/index.ts:78,79,80,81,82,83,85,93,711
webview/__tests__/pendingRequest.test.ts:11,20,28,37,45,52,61
src/MarkdownEditorProvider.ts:31,32,33,34,36
shared/constants.ts:19,22,25
webview/components/imageView/imgPathComplete.ts:11,12
webview/components/imageView/index.ts:24,25
src/utils/imageService.ts:12
webview/components/codeBlockEnhance/index.ts:10
webview/components/findBar/index.ts:17
webview/components/frontmatterPanel/index.ts:15
webview/headingStickyPlugin.ts:102
webview/ui/notice.ts:11
webview/utils/cellClickState.ts:24
webview/utils/cmThemeObserver.ts:2
webview/utils/compositionGate.ts:14
```

（值域举例：`RENAME_IMAGE_TIMEOUT_MS=15000`、`TOC_REFRESH_DEBOUNCE_MS=800`、`COMPOSITION_WAIT_TIMEOUT_MS=3000`；完整键值在 `scan.json.suspicious.magicNamed`。）

复跑命令：`node TEMP\audit\scan.mjs`；`scan.json.suspicious` 含全部 205 / 116 / 61 条明细。

---

## 4. 重复度

### 4.1 TS 口径

- 范围：168 个 `.ts`（含 `__tests__`、含 `.bench.ts`，不含 `.d.ts`）。
- 规范化：逐行 `trim` + 连续空白压成一个空格；删除空行、纯括号/分号行、纯注释行（`//`、`/*`、`*` 开头）。
- 窗口：连续 **N=6** 行完全相同；按窗口哈希分组；对同组出现位置两两比对，向前扩展为极大块，并剔除“不是块起点”的窗口（前一行也相同）。
- 计数单位：一个“两两重复块”（同一对文件/位置的块只计一次）；同一块出现 3 次会产生 3 个两两块。这是**规范化文本匹配**，不做变量重命名/语义等价判断。

### 4.2 结果

| 指标 | 数值 |
|---|---:|
| 至少出现 2 次的 6 行窗口组 | **121** |
| 合并后的两两重复块 | **358** |
| 其中 test–test | **351**（98.0%） |
| 其中 prod–prod | **4** |
| 其中 prod–test | **3** |
| 生产代码涉及的不重复行数 | **71** |

生产相关 7 块全列：

| 类型 | 行数 | 位置 A | 位置 B | 内容 |
|---|---:|---|---|---|
| prod–prod | 11 | `webview/headingFoldPlugin.ts:67` | `webview/headingStickyPlugin.ts:144` | 折叠按钮创建（`innerHTML`/`aria-*`/tooltip/mousedown/click 阻止冒泡） |
| prod–prod | 8 | `src/extension.ts:3` | `src/MarkdownEditorProvider.ts:18` | import 区 |
| prod–prod | 7 | `src/MarkdownEditorProvider.ts:580` | `src/MarkdownEditorProvider.ts:1003` | 同文件内重复 |
| prod–prod | 6 | `webview/components/toc/index.ts:216` | `webview/components/toc/index.ts:405` | 同文件内重复 |
| prod–test | 7 | `src/extension.ts:3` | `src/__tests__/webviewConfigSanitize.test.ts:2` | import 区 |
| prod–test | 7 | `src/MarkdownEditorProvider.ts:18` | `src/__tests__/webviewConfigSanitize.test.ts:2` | import 区 |
| prod–test | 7 | `webview/editor.ts:56` | `webview/__tests__/cellClickState.test.ts:2` | import 区 |

典型测试重复（前 5）：

| 行数 | 位置 A | 位置 B |
|---:|---|---|
| 24 | `webview/__tests__/input.bench.ts:5` | `webview/__tests__/scale.bench.ts:5` |
| 23 | `webview/__tests__/nestedHeadingProbe.test.ts:6` | `webview/__tests__/tableLinkDomProbe.test.ts:6` |
| 22 | `webview/__tests__/tableBrRoundtrip.test.ts:21` | `webview/__tests__/tableSoftBreak.test.ts:23` |
| 20 | `webview/__tests__/headingFold.test.ts:8` | `webview/__tests__/listDefaultBehavior.test.ts:14` |
| 17 | `webview/__tests__/firstRender.bench.ts:10` | `webview/__tests__/latexFeature.test.ts:40` |

`headingFoldPlugin.ts:67` ↔ `headingStickyPlugin.ts:144` 的 11 行块开头：

```ts
button.innerHTML = collapsed ? IconChevronRight : IconChevronDown;
const tipText = collapsed ? t("Expand content") : t("Collapse content");
button.setAttribute("aria-label", tipText);
```

### 4.3 CSS 重复

- 13 个 CSS 文件、2,714 行；按 `选择器{声明}` 粗解析（先去 `/* */`，不处理 `@media` 嵌套），声明做空白规范化。
- 跨文件**完全相同声明块（花括号体，不含选择器）**：**11 个**；其中出现文件数最多的对：`toc.css` ↔ `style.css` **4 个**、`imageView.css` ↔ `style.css` **3 个**、`heading.css` ↔ `style.css` **3 个**、`latex.css` ↔ `style.css` **3 个**。
- 跨文件**单条声明**（`prop: value`）重合：**148 条**；对数最多的：`imageView.css` ↔ `style.css` **51 条**、`toc.css` ↔ `style.css` **45 条**、`findBar.css` ↔ `style.css` **37 条**。
- **完整规则（选择器+声明）跨文件完全相同：0 个**。
- 若按“文件数只有两个”理解，最大的两个 CSS 文件 `style.css`（1,293 行）与 `imageView.css`（337 行）之间：相同声明块 **3 个**、相同单条声明 **51 条**。

示例（1 个声明块在 4 个文件重复）：

```
width: 14px; height: 14px
webview/style.css:924 / webview/components/toc/toc.css:76 /
webview/components/imageView/imageView.css:283 / webview/heading.css:36
```

复跑命令：`node TEMP\audit\scan.mjs`（`scan.json.dup`、`scan.json.css`）。

---

## 5. 测试健康度

### 5.1 测试规模

| 指标 | 数值 |
|---|---:|
| 测试文件（`*.test.ts`） | **80**（webview 64 / src 15 / shared 1） |
| 基准文件（`*.bench.ts`，不被 `vitest run` 执行） | 4 |
| 用例数（Vitest 官方汇总） | **715 passed / 715** |
| `it(` / `test(` 正则出现次数 | 701（低于官方 715，因 `it.each` 等动态生成；**以 715 为准**） |
| 测试代码行 | 10,303（占全仓 38.3%；含 `setup.ts` 等辅助文件） |
| 平均用例数 | 8.9 / 文件 |
| 用例执行时间 | 151.13 s（Vitest 报告） |
| 全量 run 墙钟 | 220.56 s（`Duration`），覆盖率命令总墙钟 233.9 s |

复跑命令：

```powershell
cd C:\Users\DJ028191\pyai-meta-repo\epytor
pnpm run test:coverage   # 本次 233.9 s，exit 0；日志 TEMP\audit\coverage.log
```

### 5.2 实际覆盖率（`pnpm run test:coverage`，exit 0）

Vitest 文本报告：

| 范围 | % Stmts | % Branch | % Funcs | % Lines | 文件数 |
|---|---:|---:|---:|---:|---:|
| **All files** | 97.04 | 92.49 | **97.93** | **98.92** | 46 |
| `src`（仅 `MarkdownDocument.ts`） | 100 | 100 | 100 | 100 | 1 |
| `src/utils` | 99.43 | 98.68 | 98.38 | 99.68 | 13 |
| `webview/i18n` | 100 | 100 | 100 | 100 | 1 |
| `webview/utils` | 95.95 | 89.27 | 97.59 | 98.54 | 31 |

由 `coverage/lcov.info` 复算的精确分母：**46 文件、1,115 行可执行行、242 个函数**；覆盖 1,103 行（98.92%）、237 个函数（97.93%）。未达 100% 的 7 个文件：

| 文件 | 行覆盖 | 未覆盖行 | 函数覆盖 |
|---|---:|---|---:|
| `webview/utils/collapseScrollGuard.ts` | 86.96% | 33–35 | 87.50% |
| `webview/utils/topBarOverflow.ts` | 90.00% | 47–48 | 100% |
| `src/utils/contentRequestCoordinator.ts` | 95.65% | 31 | 88.89% |
| `webview/utils/listBackspace.ts` | 96.67% | 31 | 100% |
| `webview/utils/minimalDiff.ts` | 97.50% | 38,167,263 | 95.00% |
| `webview/utils/viewportLedger.ts` | 97.78% | 191 | 92.86% |
| `webview/utils/markdownSerializer.ts` | 98.80% | 84 | 100% |

### 5.3 与 `vitest.config.ts` 阈值对比

| 范围 / 指标 | 声明阈值 | 实测 | 差值 | 结论 |
|---|---:|---:|---:|---|
| 全局 lines | 70 | 98.92 | +28.92 | 通过 |
| 全局 functions | 70 | 97.93 | +27.93 | 通过 |
| `src/utils/imageService.ts` lines | 85 | 100.00 | +15.00 | 通过 |
| `src/utils/getNonce.ts` lines | **100** | **100.00** | **0.00** | **通过但零余量（压线）** |
| `src/MarkdownDocument.ts` lines | 80 | 100.00 | +20.00 | 通过 |
| `src/utils/contentTransform.ts` lines | 90 | 100.00 | +10.00 | 通过 |
| `src/utils/lineMap.ts` lines | 90 | 100.00 | +10.00 | 通过 |

- **低于阈值的模块：0 个**；命令 exit 0。
- 唯一零余量项：`getNonce.ts` 行覆盖 100% vs 阈值 100%（该文件仅 1 个函数、1 行可执行代码，阈值已到上限）。
- 分支覆盖 92.49% 没有配置阈值（配置只有 lines/functions）。

**关键口径限制**：`coverage.include` 只包含 `src/utils/**/*.ts`、`src/MarkdownDocument.ts`、`webview/i18n/**/*.ts`、`webview/utils/**/*.ts`，即 **46 / 83 个生产 TS 文件**、**3,913 / 13,856 生产 TS 行（28.2%）**。1,466 行的 `MarkdownEditorProvider.ts`、1,147 行的 `webview/index.ts`、942 行的 `webview/editor.ts` 与全部 `webview/components/**` 均不在覆盖率分母内。因此“98.92%”不是全仓覆盖率，而是白名单内 1,115 行可执行行的覆盖率。

### 5.4 无同名测试文件的源码（文件名映射，估算）

规则：源码 `foo.ts` ↔ 测试 `foo.test.ts`（大小写不敏感，忽略目录）。83 个生产 TS 文件中 **35 个**无同名测试（42.2%）；若放宽为“测试文件名包含源码 basename”，为 **31 个**。该映射只是命名启发式，不代表未被执行覆盖。

```
src/extension.ts
src/i18n/webviewTranslations.ts
src/MarkdownEditorProvider.ts
src/utils/lineMap.ts
webview/components/codeBlockEnhance/index.ts
webview/components/findBar/index.ts
webview/components/frontmatterPanel/index.ts
webview/components/imagePicker/index.ts
webview/components/imageView/index.ts
webview/components/mermaidZoom/index.ts
webview/components/pathLink/fileIcons.ts
webview/components/pathLink/index.ts
webview/components/pathLink/pathComplete.ts
webview/components/tableGridPicker/index.ts
webview/components/toc/index.ts
webview/components/topBar/buildTopBar.ts
webview/components/topBar/topBarDecorations.ts
webview/components/topBarOverflow/index.ts
webview/editor.ts
webview/headingFoldPlugin.ts
webview/i18n/index.ts
webview/index.ts
webview/listMarkerPlugin.ts
webview/softBreakKeymap.ts
webview/ui/dom.ts
webview/ui/dropdownComplete.ts
webview/ui/icons.ts
webview/ui/pathCompleteCore.ts
webview/utils/collapseScrollGuard.ts
webview/utils/headingSticky.ts
webview/utils/pathSuggestionRequests.ts
webview/vendor/katexLazyStub.ts
webview/vendor/prosemirrorVirtualCursor.ts
shared/constants.ts
shared/messages.ts
```

反例（证明命名映射会高估“无测试”）：上述名单里的 `src/utils/lineMap.ts`、`webview/i18n/index.ts`、`webview/utils/headingSticky.ts`、`webview/utils/pathSuggestionRequests.ts` 在 lcov 中均为 **100% 行覆盖**；`webview/utils/collapseScrollGuard.ts` 为 86.96%，均由其他测试间接覆盖。

---

## 6. 依赖与构建

### 6.1 依赖

| 指标 | 数值 |
|---|---:|
| `dependencies`（prod） | **17** |
| `devDependencies` | **10** |
| `overrides` | 13 |
| `node_modules` 体积 | **382,993,499 B ≈ 365.25 MiB**（pnpm 状态文件会让该值有数十字节级波动） |
| `node_modules` 文件数 | 36,438 |
| `node_modules/.pnpm` 包版本目录数 | **768**（`.pnpm` 下共 769 个目录 + 1 个 `lock.yaml`） |

prod 依赖：`@codemirror/*` 5 个、`@floating-ui/dom`、`@milkdown/crepe`、`@milkdown/kit`、`katex`、`mermaid`、`prosemirror-commands`、`remark-gfm`、`remark-math`、`remark-parse`、`unified`、`unist-util-visit`、`vue`。

复跑命令：`node TEMP\audit\size.mjs`（不跟随 pnpm symlink，避免重复计算）。

### 6.2 dist 产物

审计开始时 `dist/` 为**生产构建形态**（`node esbuild.mjs --production`：无 `.map`、234 文件）；本次 `pnpm run build` 后变为 **dev 构建**（含 sourcemap）。两组数字如下：

| 指标 | 生产构建（审计前快照） | dev 构建（`pnpm run build` 后） |
|---|---:|---:|
| 总大小 | **7,764,811 B = 7.40 MiB** | **37,018,024 B = 35.30 MiB** |
| 文件数 | 234 | 468 |
| `extension.js` | **186,444 B** | 432,635 B |
| `webview.js` | **1,018,824 B** | 2,269,775 B |
| `webview.css` | 83,431 B | 98,801 B |
| `katex-styles.css` | 1,459,754 B | 1,463,195 B |
| `chunk-*.js` 合计 | **58 个 / 2,545,496 B** | 58 个 / 4,926,374 B（另有 58 个 `.js.map`） |
| 其余按需加载 chunk | 172 个 / 2,470,862 B | 172 个 / 4,442,919 B（另有 176 个 `.map`，含入口/CSS 的 map） |
| 全部按需 chunk（除 4 个入口） | **230 个 / 5,016,358 B** | — |
| `.map` 文件 | 0 | **234 个 / 23,384,325 B（22.30 MiB）** |

- 生产 dist 的入口 4 文件合计 2,748,453 B；全部 234 个文件中 JS 6,221,626 B、CSS 1,543,185 B。
- `webview.js` 占生产 dist 的 13.1%；`katex-styles.css` 占 18.8%，是单个最大的文本产物。
- dev 构建体积是生产构建的 **4.77 倍**，其中 63.2% 是 sourcemap。

### 6.3 构建耗时

```powershell
cd C:\Users\DJ028191\pyai-meta-repo\epytor
$sw=[System.Diagnostics.Stopwatch]::StartNew()
pnpm run build
$sw.Stop(); $sw.Elapsed.TotalSeconds
```

| 指标 | 数值 |
|---|---:|
| `pnpm run build` 墙钟 | **396.08 s（6 分 36 秒）**，exit 0 |
| esbuild 自报 `Done in` | 362,423 ms（362.42 s） |
| 输出 | 468 文件 / 37,018,024 B |
| 并行构建 | extension（node/cjs）+ webview（browser/esm，splitting） |

- `esbuild.mjs` 在启动时执行 `rmSync('dist', {recursive:true})`，因此每次构建都会先删除旧 `dist`。
- 本次只实测 `pnpm run build`（dev）。生产构建命令为 `pnpm run vscode:prepublish`（`node esbuild.mjs --production`），本次**未计时**；上表“生产构建”大小来自审计开始时已存在的 `dist/`。生产数字复跑：先 `pnpm run vscode:prepublish`，再 `node TEMP\audit\size.mjs`。

---

## 7. 异常点（仅陈述数据，不含建议）

1. **单文件与单函数高度集中**：`src/MarkdownEditorProvider.ts` 1,466 行，全仓第一；`webview/components/toc/index.ts` 的 `initToc` 一个函数 472 行，占该文件 589 行的 **80.1%**；`createImageView` 452 行，占其文件 689 行的 65.6%。全仓跨度 >200 行的函数 12 个（测试 `describe` 回调 3 个、生产 9 个）。
2. **重复与类型逃逸几乎都发生在测试侧**：358 个重复块中 351 个是 test–test（98.0%），生产相关只有 7 块、71 行；`as unknown as` 116 处中 113 处在测试（97.4%），非空断言 205 处中 199 处在测试（97.1%）。生产侧 `: any` 与 `as any` 均为 0、非空断言仅 6 处。
3. **覆盖率分母不是全仓**：98.92% 行覆盖只覆盖 46/83 个生产 TS 文件、3,913/13,856 生产 TS 行（28.2%）；37 个生产文件不在 `coverage.include`，包含 3 个最大的 TS 文件（1,466 / 1,147 / 942 行）。阈值层面唯一零余量是 `getNonce.ts` 100% vs 100。
4. **构建与产物体积跳变**：`pnpm run build` 396.08 s；dev 产物 35.30 MiB 是生产 7.40 MiB 的 4.77 倍（sourcemap 22.30 MiB），单次构建输出 468 个文件。

---

## 附录：复跑清单与产物

| 命令 | 用途 | 本次结果 |
|---|---|---|
| `node TEMP\audit\scan.mjs` | 体积 / 函数 AST / 可疑代码 / 重复 / 测试映射 | 写出 `scan.json` |
| `node TEMP\audit\lcov.mjs` | 从 `coverage/lcov.info` 复算逐文件覆盖率 | 写出 `lcov.json` |
| `node TEMP\audit\size.mjs` | node_modules / dist / 依赖计数 | 见 6.1、6.2 |
| `pnpm run test:coverage` | 80 文件 / 715 用例 + v8 覆盖率 | 233.9 s，exit 0，`coverage.log` |
| `pnpm run build` | dev 构建计时 | 396.08 s，exit 0，`build-dev.log` |
| `Get-ChildItem ... \| Measure-Object` | 目录级行数交叉核对 | 见 1.1 |

本次新增产物（均在 `TEMP\audit\`，已被 gitignore；该目录下另有并行审计产生的其他文件，不属于本报告）：

- `scan.json`：逐文件行数、2,758 个函数、全部可疑代码行、重复块、测试映射
- `lcov.json`：46 个纳入覆盖率的文件及逐行未覆盖行号
- `coverage.log`：Vitest 完整输出（715 用例、覆盖表、exit 0）
- `build-dev.log`：esbuild 输出（468 文件、362.4 s）
- `scan.mjs` / `lcov.mjs` / `size.mjs`：本报告全部脚本

**未跑项**：`pnpm run vscode:prepublish`（生产构建）未单独计时；`vitest --reporter=json` 未另跑（用例总数取自 `pnpm run test:coverage` 的官方汇总 715）。无其它未跑项。
