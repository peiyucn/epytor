# epytor Extension 端重构审计（只读）
> **基线说明（2026-10-29 补）**：本报告的路径 / 行号 / 文件大小均为 2026-10-27 重构前快照；重构后 `webview/utils/` 已按功能域拆到 `webview/app/`、`editor/`、`markdown/` 等目录，行号可能失效，结论以 `docs/tech-debt.md` 的最新记录为准。

- **审计对象**：`epytor/src/**`（Extension 端）+ `epytor/shared/**` 及其测试 `src/__tests__/**`、`shared/__tests__/**`
- **不在范围**：`webview/**`（另人负责）；本报告只在「跨端共享符号」处提及 webview 的引用情况，用于判死活代码
- **基线**：分支 `dev`，HEAD `252b647`（`docs: 发布前定版——1.2.7`），工作区 32 项未提交改动（1.3.0 批次）。**本次审计未修改任何文件**
- **方法**：全量读源码 + `git grep` 交叉验证符号引用 + 括号匹配脚本量函数跨度 + `wc` 量文件行数
- **未验证项（如实标注）**：
  1. 未运行 `pnpm run typecheck` / 未跑覆盖率；测试基线仅跑了 `pnpm test`（结果见文末）
  2. 「`new MarkdownEditorProvider()` 在 vitest 下必然抛错」是**从代码推断**（构造函数首行调用的 API 不在 mock 里），**未执行验证**（新增测试文件会污染工作区，审计期内不做）
  3. 性能/竞态类结论只给「存在理论窗口」，未做真机复现

---

## 一、按严重度排序的问题表

| 编号 | 问题 | 证据（file:line） | 影响 | 建议动作 | 工作量 |
| :-- | :-- | :-- | :-- | :-- | :-- |
| **A1** | 18 个 per-uri 状态容器无统一入口，`dispose` 只清 9 个，6 个从不清理（4 个永不清） | `MarkdownEditorProvider.ts:67,70,79,91,98,105,108,109,112,118,233,243,261,262,310`；清理块 `:383-397` | 脏标记/快照跨面板残留 → 关闭再打开可能带着上一次的 `_webviewDirty=true` 触发「失活即落盘」（`:426`）；`_lastSaveTimes`/`_frontmatterMap`/`_lastPreviewLines` 无界增长 | 引入 `DocumentState` 对象 + `DocumentStateStore`（`get(uriKey)`/`dispose(uriKey)`），把 15 个 per-uri 容器收进去；顺带统一 key 口径（现在 `_pendingNavigations` 用 fsPath，其余用 uriKey） | M |
| **A2** | webview 消息入口无 try/catch，4 处 `.catch(() => {})` 静默吞异常 | `:368-372`（无兜底）；`:797`、`:802`、`:812`、`:817`（空 catch）；`:523`（`import("fs").then()` 无 catch）；`:530`（async setTimeout 回调只有 try/finally） | webview 已销毁时 `postMessage` 抛错 → 未处理的 Promise 拒绝，用户零提示；图片/补全失败完全静默 | ① 给 `onDidReceiveMessage` 包 try/catch + `console.error`；② 4 处 `.catch(()=>{})` 改为「记录日志 + 回 `*Error` 消息」；③ `import("fs")` 补 `.catch` | S |
| **A3** | 单文件 1466 行 / 单函数 231 行：Provider 同时承担 8 类职责 | 全文 `:1-1466`；`_handleWebviewMessage` `:608-838`（231 行、16 个 case）；34 个方法中 7 个 `_handle*` | 消息路由、保存编排、revert、文件监听、导航、状态栏、图片 CRUD、路径补全全在一个类；任何改动都要通读 1400 行 | 分三步机械外移（每步一个可提交改动）：① 图片编排 5 个方法 + `_registerImageMapping` → `src/image/imageHandlers.ts`；② 导航 5 个方法 → `src/navigation/navigator.ts`；③ 保存链 `_saveNow`/`_requestContent`/`_prepareContentForSave` → `src/save/saveCoordinator.ts`（已有 `ContentRequestCoordinator` 可复用） | L（可拆 3 次提交） |
| **A4** | 「文档相对路径 / `@/` workspace 别名」解析逻辑 4 份 + workspaceRoot 取法 3 份 + 相对路径归一化 3 份 | 解析：`:473-484`、`:1125-1131`、`:1385-1393`、`:1452-1457`；workspaceRoot：`:476-477`、`:1114-1115`、`:1373-1376`、`:1448-1449`；relPath 归一：`:1279-1281`、`:1343-1344`、`utils/imageService.ts:174-184` | 任一处口径变更（大小写、`..` 越界、`@/` 语义）必然漏改另三处；越界防护只覆盖 `_handleOpenFileMessage`（`:487`），其余三处靠各自 try/catch | 新建 `src/utils/docPath.ts`（纯函数、可单测）：`resolveDocRelativePath({raw, workspaceRoot, docDir})` 与 `toDocRelativePath(docFsPath, absFsPath)`（后者直接复用 `imageService.buildRelPath`）；4+3 处改调用 | M |
| **A5** | revert 推送块两份逐字重复（含脏标记/副本/快照三连写） | 外部变更：`:565-588`；显式 revert：`:999-1011` | 6 行 payload 完全相同；未来改 revert 消息字段必漏一处 | 提 `_applyRevertToPanel(document, uriKey, diskContent)` 一个方法，两处改调用 | S |
| **A6** | 测试结构性缺口：核心 1466 行 Provider 零覆盖，且被排除在覆盖率度量外 | `vitest.config.ts:35-40` 的 `coverage.include` 只含 `src/utils/**` + `MarkdownDocument.ts`；`git grep MarkdownEditorProvider -- src/__tests__` 无结果；`__mocks__/vscode.ts:45-49` 的 `window` 只有 3 个 show* 方法，缺 `createStatusBarItem`/`registerCustomEditorProvider`/`Position`/`Range`/`env`/`registerCommand` | 70% 总体门禁只覆盖 utils，Provider/extension 的 1666 行（1466+200）不在分母里 → 「整体 ≥70%」名不副实；`shared/constants.ts:14 extractUrlScheme`（安全白名单解析）也无任何测试 | ① mock 补到能实例化 Provider（`createStatusBarItem`/`Position`/`Range`/`env`/`EventEmitter` 真实实现）；② 新增 `src/__tests__/markdownEditorProvider.test.ts` 先覆盖 3 条纯路径（`_lifecyclePayload`、`_prepareContentForSave`、`_handleWebviewMessage` 的 `wordCount`/`viewportLine`/`contentResponse` 分支）；③ `extractUrlScheme` 补表格驱动用例 | M |
| **A7** | 死代码 / 无效导出面：`_isDirty` 只写不读；15 个导出无跨文件非测试引用；13 个导出只被测试引用 | `MarkdownDocument.ts:5,26,37,56`（`_isDirty` 4 处赋值、0 处读）；清单见 §A7 | 读者以为脏状态由文档模型维护，实际由 Provider 的两个 Map 各自维护 → 认知误导；`export` 面越大，重构时越不敢动 | ① 删除 `_isDirty`（或改成 `get isDirty()` 后被 Provider 真正使用，二选一，别保留假字段）；② 15 个纯内部类型去掉 `export`；③ 13 个「测试专用导出」在文件头注明「test seam」，或经 `__tests__` 直接测公共入口后收回 | S |
| **A8** | `executeCommand` / `openExternal` 未 await 且无 catch | `:511`（`vscode.open`）、`:712`（`openExternal`）、`:775`（`openSettings`） | 命令不存在/无法打开时静默失败 + 未处理拒绝（例如 `mailto:` 无邮件客户端） | 三处统一 `.then(undefined, err => console.error(...))` 或 `await` + try/catch | S |
| **A9** | 失败路径无用户可见反馈 | `:1285`（`readDirectory` catch 后发空列表）、`:1464`（`_handleResolveImagePath` 全 catch 静默） | 图库/路径补全打不开目录时，用户只看到「空列表」，无原因 | 两处 catch 改为回 `*Error` 消息（协议里已有 `imageRenameError`/`imageUploadError` 先例），或至少 `console.warn` | S |
| **A10** | `_prepareContentForDisplay` 隐式写两个状态 + 参数重赋值 | `:1101-1140`：`:1107-1108` 写 `_frontmatterMap`、`:1133` 写 `_imageUriMaps`、`:1110` 重赋值入参 | 名字是「准备显示内容」，实际是「写共享缓存」；4 个调用点（`:583`、`:640`、`:1006`）都依赖副作用，无法单独测 | 拆成纯函数 `buildDisplayContent(content, {workspaceRoot, mdDir}, toWebviewUri)` + 调用方显式 `_frontmatterMap.set(...)` / 登记映射 | M |
| **A11** | 常量重复与魔术数 | `IMAGE_EXTS` 两份：`:1244`、`:1405`；`:1420` `.slice(0, 15)`；`utils/imageService.ts:50` `.slice(2, 6)` | 与项目规范「语义数字必须命名常量」冲突；改图片后缀白名单需改两处 | `IMAGE_EXTS` 移到 `shared/constants.ts`（webview 侧也用得上）；`15` → `PATH_SUGGESTION_LIMIT`，`(2,6)` → 随机后缀常量 | S |
| **A12** | `fs` 静态 import 与动态 import 混用 + 同步 IO | `:1`（`import * as fs`）、`:523`（`import("fs").then`）、`:1459`（`fs.existsSync` 在消息处理链上同步阻塞） | 同一模块两套加载方式；`existsSync` 在 Extension Host 主线程做磁盘探测 | 统一为一处静态 import；`existsSync` 换 `vscode.workspace.fs.stat`（与 `_handleGetProjectImages` 同口径），方法改 async | S |
| **A13** | 测试文件与模块名不符：`lineMap.ts` 的测试寄居在 `contentTransform.test.ts` | `src/__tests__/contentTransform.test.ts:10`（`import { computeLineRanges, computeDisplayLineRanges } from "../../src/utils/lineMap"`），`:151-303` 共 2 个 describe | 违反项目 AGENTS「`<模块名>.test.ts` 与被测文件同名」；只看文件名会误判 lineMap 无测试 | 把 `:151-303` 拆到 `src/__tests__/lineMap.test.ts`（纯移动，行为不变） | S |
| **A14** | 格式化缺陷：语句与左花括号同行 | `:1156`（`private _prepareContentForSave(...): string {        const frontmatter = ...`） | 可读性 + 后续 diff 噪声 | 换行 | S |
| **A15** | `planImageLocalDir().downgraded` 算了不用：工作区级 `imageLocalPath` 越界降级**静默发生** | 计算 `utils/imageLocalDir.ts:65-70`；读取方只有测试（`imageLocalDir.test.ts:59,70,81`）；生产调用点 `imageService.ts:109-114`、`MarkdownEditorProvider.ts:1257-1258` 均只看 `plan.dir` | 与图床降级不一致：图床降级会 `notice`（`:1183-1187`），本地目录降级不告诉用户，图片落到 `<mdDir>/images` 而用户以为在配置的目录 | 两个调用点读 `downgraded` 后回一条 `notice`（协议已有 `notice`，零协议改动） | S |
| **A16** | 跨边界字符串未收敛到枚举：同表内两项口径不一致 | `extension.ts:23`（`sanitizeSerializationMode` 收敛）vs `extension.ts:27`（`typeof value === "string" ? value : "wrap"`，任意字符串直通） | `tableWrapModeChanged.mode` 是 `string`（`shared/messages.ts:56`），webview 必须自己兜底才安全；新增消费点容易忘记兜底 | 在 `shared/tableWrap.ts` 加 `type TableWrapMode = "wrap" \| "nowrap"` 已有但全仓未用（见 A7），改用 `normalizeTableWrapMode(value): TableWrapMode` + 消息字段类型改 `TableWrapMode` | S |

### 类型逃生（结论：本范围达标，无需动作）

| 检查项 | 数量 | 位置 |
| :-- | :-- | :-- |
| `any` | **0** | —（`git grep -P "\bany\b" -- src shared` 排除 `__tests__` 后命中 **0** 行；`git grep -P ":\s*any\b\|<any>\|any\[\]"` 同样 0） |
| `as unknown as` | **1** | `utils/lineMap.ts:50`（`parser.parse(...) as unknown as { children: MdastTopLevelNode[] }`，注释已说明不引 `@types/mdast`） |
| `as SomeType`（单层断言） | **3** | `extension.ts:123`、`extension.ts:175`、`utils/imageService.ts:20` |
| 非空断言 `!` | **0** | —（正则扫描 `\w!\.`/`\w!)`/`]!` 无命中） |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | **0** | — |

> 依据命令：`git grep -n --perl-regexp "\bany\b|as unknown as|as any" -- src shared`、`git grep -n --perl-regexp "\w\!\.|\w\!\)|\]\!\." -- src shared`（均排除 `__tests__`）。

---

## 二、逐项展开

### A1｜状态碎片化：18 个容器、6 个漏清、3 套 key 口径

**证据 1：容器清单（13 Map + 3 Set + 2 标量）**

```
:67   _webviewPanels        Map<uriKey, WebviewPanel>
:70   _lastSaveTimes        Map<uriKey, number>          ← 从不删除
:79   _webviewDirty         Map<uriKey, boolean>         ← 从不删除
:91   _pushedContent        Map<uriKey, string>
:98   _lastSavedContent     Map<uriKey, string>
:105  _panelActive          Map<uriKey, boolean>
:108  _imageUriMaps         Map<uriKey, Map<string,string>>
:109  _frontmatterMap       Map<uriKey, string>          ← 从不删除
:112  _pendingNavigations   Map<fsPath, {line,ts}>       ← 键口径不同
:118  _initializedPanels    Set<uriKey>
:233  _wordCounts           Map<uriKey, {...}>
:243  _fileSizes            Map<uriKey, number>
:261  _lastPreviewLines     Map<uriKey, number>          ← 从不删除
:262  _lastTextLines        Map<uriKey, number>
:310  _fallbackWarnedUris   Set<uriKey>
:1212 _insecureServerUrlWarned Set<url>                  ← 全局（可接受）
:115  _pendingRevealLine    标量
:252  _pendingEditorReveal  标量
```

**证据 2：dispose 只清 9 个（`:383-397`）**

```ts
383: webviewPanel.onDidDispose(() => {
384:     this._webviewPanels.delete(uriKey);
385:     this._imageUriMaps.delete(uriKey);
386:     this._initializedPanels.delete(uriKey);
387:     this._panelActive.delete(uriKey);
388:     this._pushedContent.delete(uriKey);
389:     this._lastSavedContent.delete(uriKey);
390:     this._wordCounts.delete(uriKey);
391:     this._fileSizes.delete(uriKey);
392:     this._fallbackWarnedUris.delete(uriKey);
```

漏清：`_lastSaveTimes`(70)、`_webviewDirty`(79)、`_frontmatterMap`(109)、`_pendingNavigations`(112)、`_lastPreviewLines`(261)、`_lastTextLines`(262)。
其中 `_lastTextLines` 在 `:139` 读取即删、`_pendingNavigations` 在 `:178` 读取即删（未消费则永久驻留）；**`_webviewDirty`/`_lastSaveTimes`/`_frontmatterMap`/`_lastPreviewLines` 全程无任何 `.delete`**（`git grep -n "\.delete(\|\.clear()"` 结果里没有它们）。

**为什么这是 bug 温床（不是洁癖）**：`:426` 的失活落盘判据是

```ts
426: if (this._webviewDirty.get(uriKey) === true) {
427:     const cts = new vscode.CancellationTokenSource();
428:     void this.saveCustomDocument(document, cts.token).finally(() => cts.dispose());
```

`_webviewDirty` 在面板销毁时不重置；同一 URI 关闭再打开（`resolveCustomEditor` 不触碰它，`:332-375` 只播种 `_lastSavedContent`），若上次遗留 `true`，新面板首次失活就会触发一次「拉取超时 → 用内存内容落盘」。这条路径与 `:319` 的用户警告（「编辑器无响应」）相连。

**证据 3：三套 key 口径**

```
:150  const uriKey = vscode.Uri.file(fsPath).toString();   // 用于查 panel
:160  this._pendingNavigations.set(fsPath, { line, ts: Date.now() });   // 存的是 fsPath
:176  const pending = this._pendingNavigations.get(fsPath);             // 消费的是 fsPath
:286  if (pending && pending.uriKey === uriKey)                          // 又比 uriKey
```

同一个 `setPendingNavigation` 里先算 uriKey 再按 fsPath 存，两套身份并存。Windows 上 `Uri.file(p).toString()` 与 `p` 不是可互换键（大小写/盘符/编码），任何「拿 uriKey 当 fsPath」的新代码都会静默 miss（miss 的后果是导航丢失，不报错）。

**建议动作（一个可提交改动）**：新增 `src/documentState.ts`

```ts
export interface DocumentState {
    panel?: vscode.WebviewPanel;
    lastSaveTime: number;
    webviewDirty: boolean;
    pushedContent?: string;
    lastSavedContent?: string;
    panelActive: boolean;
    imageUriMap: Map<string, string>;
    frontmatter: string;
    initialized: boolean;
    wordCount?: WordCount;
    fileSize?: number;
    lastPreviewLine?: number;
    lastTextLine?: number;
    fallbackWarned: boolean;
    pendingNav?: { line: number; ts: number };
}
export class DocumentStateStore {
    get(uriKey: string): DocumentState;   // 懒建
    dispose(uriKey: string): void;        // 一次清空，杜绝漏项
    find(fsPath: string): DocumentState | undefined;  // 过渡期兼容 fsPath 键
}
```

第一批只做「搬家 + dispose 单点」，不改任何行为；验收方式：`git grep -c "_.* = new Map"` 的 per-uri 容器数应降为 1，且 `_registerPanelDisposeCleanup` 只剩一行 `store.dispose(uriKey)`。

---

### A2｜错误处理缺口：未兜底的 async 入口 + 4 处空 catch

**证据 1：消息入口无 try/catch（`:368-372`）**

```ts
368: webviewPanel.webview.onDidReceiveMessage(
369:     async (message: ToExtensionMessage) => {
370:         await this._handleWebviewMessage(document, webviewPanel, uriKey, message);
371:     },
372: );
```

`_handleWebviewMessage` 是 231 行的 `async`，内部 16 个分支里至少 6 个 `await`。任一分支抛错（最现实的是面板已销毁时 `panel.webview.postMessage` 抛 "Webview is disposed"，调用点见 `:584`、`:646`、`:781`、`:1184` 等）→ 该 async 回调返回 rejected promise，`onDidReceiveMessage` 不消费 → 未处理拒绝，无日志无提示。

**证据 2：四处空 catch（`:791-798`、`:800-804`、`:805-814`、`:815-819`）**

```ts
791: this._handleImageUpload(
...
797: ).catch(() => {});
...
802: this._handleGetProjectImages(document, panel, uriKey, message.id).catch(() => {});
...
812: ).catch(() => {});
...
817: this._handleGetPathSuggestions(document, panel, message.id, message.query).catch(() => {});
```

注意 `_handleImageUpload`（`:1161-1209`）与 `_handleImageRename`（`:1291-1356`）内部**已自带** try/catch 并回错误消息，所以这 4 个 `.catch(()=>{})` 真正会吞掉的是「自己 catch 之外的部分」与 `postMessage` 抛错——吞得越隐蔽越难查。

**证据 3：`import("fs").then()` 无 catch（`:523`）**

```ts
523: import("fs").then(({ watch: fsWatch }) => {
...
599:     fsWatcher.on("error", (error) => { console.warn("[epytor] file watcher error:", error); });
```

watcher 自身的 `error` 事件有处理（好），但 `import()` 的 rejection 无人接（`:602-603` 的 dispose 回调永远不会注册 → 面板关闭后 watcher 泄漏，若 import 在某环境下失败）。

**证据 4：async setTimeout 只有 finally 没有 catch（`:530-595`）**

```ts
530: debounceTimer = setTimeout(async () => {
...
537:     try {
544:         const latest = await this._requestContent(document, uriKey);
...
592:     } finally {
593:         cts.dispose();
594:     }
595: }, FS_WATCH_DEBOUNCE_MS);
```

`try` 内的 `document.revert` 有内层 catch（`:547-551`），但 `:584` 的 `postMessage`、`:570` 的 `document.update` 无兜底 → 定时器回调里的异常同样成为未处理拒绝。

**建议动作（一个可提交改动）**：在 `:369` 处加

```ts
async (message) => {
    try {
        await this._handleWebviewMessage(document, webviewPanel, uriKey, message);
    } catch (error) {
        console.error("[epytor] webview message failed:", message.type, error);
    }
}
```

（`message.type` 进日志即可定位分支，不必回显内容）；同一提交把 4 处 `.catch(()=>{})` 换成 `.catch((e) => console.error("[epytor] handler failed:", e))`，`:523` 补 `.catch`。

---

### A3｜超大文件 / 超长函数

**文件行数（`wc -l` 口径，`src` + `shared`，排除测试）**

| 行数 | 文件 |
| --: | :-- |
| **1466** | `src/MarkdownEditorProvider.ts` |
| 300 | `src/utils/imageService.ts` |
| 280 | `src/utils/imageServerConfig.ts` |
| 210 | `src/extension.ts` |
| 122 | `src/utils/contentTransform.ts` |
| 其余 | ≤ 83 |

**函数跨度（括号匹配，`MarkdownEditorProvider.ts`）**

| 函数 | 起止 | 行数 |
| :-- | :-- | --: |
| `_handleWebviewMessage` | 608–838 | **231** |
| `_registerFileWatcher` | 516–605 | 90 |
| `_handleGetPathSuggestions` | 1358–1437 | 80 |
| `_handleImageRename` | 1291–1356 | 66 |
| `_getHtmlForWebview` | 1046–1099 | 54 |
| `_handleGetProjectImages` | 1237–1289 | 53 |
| `_registerViewStateHandler` | 401–452 | 52 |
| `_handleImageUpload` | 1161–1209 | 49 |
| `resolveCustomEditor` | 332–375 | 44 |
| `_prepareContentForDisplay` | 1101–1140 | 40 |

**其它文件**

- `src/extension.ts`：`switchToPreview` 命令体 `:151-205`（55 行）、`switchToTextEditor` 命令体 `:115-143`（29 行）
- `src/utils/imageService.ts`：`uploadImageToServer` `:192-300`（109 行，含 multipart 拼装 + HTTP + JSON 解析三段）、`saveImageLocally` `:90-172`（83 行，含目录解析 + 去重 + 写盘）
- `src/utils/imageServerConfig.ts`：`resolveImageServerConfig` `:181-217`（37 行）、`readServerStorageOrigin` `:237-263`（27 行）

**`_handleWebviewMessage` 的 8 类职责（16 个 case）**

| 类 | case（行号） |
| :-- | :-- |
| 初始化/生命周期 | `ready` 616、`panelActive`（在 `:401` 另处） |
| 脏标记同步 | `markDirty` 662、`unsavedContent` 669 |
| 保存链路 | `contentResponse` 676、`frontmatterUpdate` 686（内部完整跑一次「拉取→重组→update→写盘」） |
| 编辑器类型切换 | `switchToTextEditor` 720（落盘 + `reopenActiveEditorWith` + 兜底 reveal） |
| 导航 | `openFile` 715、`viewportLine` 834 |
| 外部打开 | `openUrl` 709、`openSettings` 774 |
| 图片编排 | `uploadImage` 777、`getProjectImages` 800、`renameImage` 805、`resolveImagePath` 820 |
| 状态栏 | `wordCount` 825 |
| 路径补全 | `getPathSuggestions` 815 |

**建议动作（拆成 3 个独立提交，每个都只是「搬方法 + 传依赖」，不改逻辑）**

1. 图片：`_handleImageUpload` / `_handleGetProjectImages` / `_handleImageRename` / `_handleResolveImagePath` / `_registerImageMapping`（`:1147-1154`）+ `_warnInsecureServerUrlOnce` + `_warnImageServerIssues` → `src/image/imageHandlers.ts`，构造参数为 `{ getPanel, postTo, getImageUriMap, refreshFileSize }` 之类的最小接口。
2. 导航：`setGlobalRevealLine` / `_consumeGlobalRevealLine` / `setPendingNavigation` / `_consumePendingNavigation` / `_consumeLastTextLine` / `_handleOpenFileMessage` / `revealLineAtTop` → `src/navigation/navigator.ts`。
3. 保存：`_saveNow` / `_requestContent` / `_prepareContentForSave` / `_prepareContentForDisplay` / `_markDirty` / `_postLineMapUpdate` → `src/save/saveCoordinator.ts`。

验收：每次搬完 `pnpm run verify` 通过；`MarkdownEditorProvider.ts` 行数应分别降到 ≈1150 / ≈1000 / ≈800；`_handleWebviewMessage` 每个 case 体 ≤ 3 行（纯转发）。

---

### A4｜重复逻辑：路径解析与相对路径归一化

**重复 1：`@/` workspace 别名 + 相对路径解析（4 份）**

```ts
// ① _handleOpenFileMessage  :473-484
473: if (filePath.startsWith("@/")) {
475:     const workspaceRoot =
476:         containingFolder?.uri.fsPath ??
477:         vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
478:     absPath = workspaceRoot
479:         ? path.join(workspaceRoot, filePath.slice(2))
480:         : path.resolve(path.dirname(docFsPath), "..", filePath.slice(2));
481: } else {
482:     const docDir = path.dirname(docFsPath);
483:     absPath = path.resolve(docDir, filePath);
484: }

// ② _prepareContentForDisplay  :1125-1131
1125: if (src.startsWith('@/')) {
1127:     const root = workspaceRoot ?? mdDir;
1128:     absPath = path.join(root, src.slice(2));
1129: } else {
1130:     absPath = path.resolve(mdDir, src);
1131: }

// ③ _handleGetPathSuggestions  :1385-1393
1385: if (dirPart.startsWith('@/')) {
1386:     absDir = workspaceRoot ? path.join(workspaceRoot, dirPart.slice(2)) : docDir;
1389: } else if (dirPart === '' || dirPart.startsWith('./') || dirPart.startsWith('../')) {
1390:     absDir = path.resolve(docDir, dirPart || '.');
1391: } else {
1392:     absDir = path.resolve(docDir, dirPart);
1393: }

// ④ _handleResolveImagePath  :1452-1457
1452: if (relPath.startsWith('@/')) {
1453:     const root = workspaceRoot ?? mdDir;
1454:     absPath = path.join(root, relPath.slice(2));
1455: } else {
1456:     absPath = path.resolve(mdDir, relPath);
1457: }
```

四份口径**互相不一致**：① 的 `@/` 在没有 workspace 时回退到「文档父目录」，②③④ 回退到「文档目录」；③ 还多一条 `./`/`../` 显式分支（结果与 else 相同，纯冗余）。另见 §A1 的越界防护只在 ① 有（`:487`）。

**重复 2：workspaceRoot 取法（3 份）**

```ts
1114: const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
1115:     ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

1373: const workspaceFolder = vscode.workspace.workspaceFolders?.find(
1374:     f => docFsPath.startsWith(f.uri.fsPath + sep),
1375: ) ?? vscode.workspace.workspaceFolders?.[0];

1448: const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath
1449:     ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
```

`1373-1375` 用手写 `startsWith` 找所属 folder，`:468-470` 又是同一段手写逻辑的第二份——而 `vscode.workspace.getWorkspaceFolder(uri)` 就是这件事的官方 API，已经在 `:1114` 与 `:1448` 用了。

**重复 3：相对路径归一化（3 份，其中 1 份是现成函数）**

```ts
// utils/imageService.ts:174-184（已有实现，含测试 imageService.test.ts:129）
174: export function buildRelPath(docUri: vscode.Uri, fileUri: vscode.Uri): string {
179:     let rel = path.relative(mdDir, fileUri.fsPath).replace(/\\/g, "/");
180:     if (!rel.startsWith(".")) { rel = "./" + rel; }
...
// :1279-1281（图库）
1279: const rel = path.relative(mdDir, fileUri.fsPath).replace(/\\/g, '/');
1280: relPath = rel.startsWith('.') ? rel : './' + rel;
// :1343-1344（重命名）
1343: const rel = path.relative(mdDir, targetUri.fsPath).replace(/\\/g, '/');
1344: const newRelPath = rel.startsWith('.') ? rel : './' + rel;
```

**建议动作（一个可提交改动）**：新建 `src/utils/docPath.ts`

```ts
export function resolveWorkspaceRoot(uri: vscode.Uri): string | undefined;  // getWorkspaceFolder ?? workspaceFolders[0]
export function resolveDocPath(raw: string, ctx: { docDir: string; workspaceRoot?: string }): string;  // @/ + 相对
export function toDocRelativePath(docFsPath: string, absFsPath: string): string;  // 复用 buildRelPath 语义
```

先替换「重复 2 + 重复 3」（低风险、纯等价），再单独提交替换「重复 1」（会改变 ① 的无 workspace 行为，需显式决定口径并写测试）。

---

### A5｜重复逻辑：revert 推送块两份

```ts
// ① 外部变更采纳（watcher 内）  :577-588
577: // 真正的外部变更：采纳盘上内容（document.revert 已读入）。
579: this._lastSavedContent.set(uriKey, diskContent);
580: const panel = this._webviewPanels.get(uriKey);
581: if (panel) {
582:     const revertContent = document.getText();
583:     const displayContent = this._prepareContentForDisplay(revertContent, document, panel, uriKey);
584:     panel.webview.postMessage({
585:         type: "revert",
586:         ...this._lifecyclePayload(uriKey, displayContent, computeDisplayLineRanges(revertContent)),
587:     });
588: }

// ② 显式 revert  :1002-1011
1002: this._lastSavedContent.set(uriKey, document.getText());
1003: const panel = this._webviewPanels.get(uriKey);
1004: if (panel) {
1005:     const revertContent = document.getText();
1006:     const displayContent = this._prepareContentForDisplay(revertContent, document, panel, uriKey);
1007:     panel.webview.postMessage({
1008:         type: "revert",
1009:         ...this._lifecyclePayload(uriKey, displayContent, computeDisplayLineRanges(revertContent)),
1010:     });
1011: }
```

前置的「脏标记/副本/快照三连」也重复：`:565-566`（`_webviewDirty.set(false)` + `_pushedContent.delete`）vs `:999-1000`。作者已经为此抽过 `_lifecyclePayload`（注释 `:1014-1019` 明确说是为消三处重复），但只抽了 payload，没抽这个块。

**建议动作**：提 `private _applyRevertToPanel(document, uriKey): void`，内含「清脏标记 + 删副本 + 播种快照 + 推送 revert」；两处改一行调用。

---

### A6｜测试覆盖缺口（含结构性阻断）

**1) 哪些非平凡模块没有对应测试文件**

| 模块 | 行数 | 测试 | 备注 |
| :-- | --: | :-- | :-- |
| `src/MarkdownEditorProvider.ts` | 1466 | **无** | `git grep MarkdownEditorProvider -- src/__tests__` 空 |
| `src/extension.ts` | 210 | 仅 `CONFIG_BROADCASTS` 表（`configBroadcasts.test.ts`，6 个 it） | `activate()` 本体、两个命令处理函数零覆盖 |
| `src/i18n/webviewTranslations.ts` | 70 | 无 | 纯数据，可接受 |
| `src/utils/lineMap.ts` | 83 | **无同名测试**（被测在 `contentTransform.test.ts:151-303`） | 见 A13 |
| `shared/constants.ts` | 28 | 无 | `extractUrlScheme`（`:14`）是 `openUrl` 白名单的唯一判定依据（`MarkdownEditorProvider.ts:711`），**无任何用例** |
| `shared/messages.ts` / `shared/tableWrap.ts` | 70 / 33 | tableWrap 有（`webview/__tests__/tableWrap.test.ts`），messages 无（纯类型） | — |

**2) 覆盖率分母被裁剪（关键）**

```ts
// vitest.config.ts:35-40
include: [
    "src/utils/**/*.ts",
    "src/MarkdownDocument.ts",
    "webview/i18n/**/*.ts",
    "webview/utils/**/*.ts",
],
```

`MarkdownEditorProvider.ts`(1466) + `extension.ts`(210) + `src/i18n`(70) 共 1746 行**不在 `include` 里**，因此不参与 `thresholds.lines: 70`。CI 报的「整体 ≥70%」只对 utils 有效。这与项目 AGENTS 的覆盖率表不矛盾（表里也没列 provider），但**审计视角必须点明**：门禁给不出「核心编排层是否被测」的任何信号。

**3) 结构性阻断：mock 表面不足以实例化 Provider**

`__mocks__/vscode.ts`（71 行）导出：`Uri`、`FileType`、`workspace`（fs/getConfiguration/getWorkspaceFolder/workspaceFolders）、`window`（3 个 show*）、`commands.executeCommand`、`EventEmitter`、`l10n`、`CancellationTokenSource`。

Provider 实际用到的、mock 里**没有**的（`git grep -oh "vscode\.[A-Za-z]+\.[A-Za-z]*"` 结果比对）：`window.createStatusBarItem`、`window.registerCustomEditorProvider`、`window.onDidChangeActiveTextEditor`、`window.onDidChangeTextEditorVisibleRanges`、`window.showTextDocument`、`window.activeTextEditor`、`window.tabGroups`、`workspace.openTextDocument`、`workspace.onDidChangeConfiguration`、`Position`、`Range`、`Selection`、`TextEditorRevealType`、`StatusBarAlignment`、`ViewColumn`、`env.language`、`env.openExternal`、`commands.registerCommand`、`TabInputCustom`、`TabInputText`。

构造函数首行就调 `vscode.window.createStatusBarItem`（`:267-271`）→ **推断**（未执行）：`new MarkdownEditorProvider(ctx)` 在现有 vitest 环境里直接 TypeError，这是「为什么 1466 行零测试」的机制性原因，不是「懒得写」。

**4) 现有测试的结构**：16 个文件、246 个用例（实测），主体是纯函数（`contentTransform` 63、`imageService` 51、`imageServerConfig` 30、`imageLocalDir` 15…）。`imageService.test.ts`（51 个用例、8 个 describe）确实测了 `saveImageLocally` 的目录选择/MD5 去重分支（`vscode.workspace.fs` mock），所以**不能**笼统说「只测纯函数」——准确说法是：**utils 层测到了分支，Provider 编排层与命令层零覆盖**。

**建议动作（按可提交粒度拆 3 步）**

1. 扩 `__mocks__/vscode.ts`：补 `Position`/`Range`/`Selection`/`StatusBarAlignment`/`window.createStatusBarItem`（返回带 `show/hide/dispose` 的对象）/`env`/`registerCommand`。**此项单独提交，自身不改任何生产代码**。
2. 新增 `src/__tests__/markdownEditorProvider.test.ts`，第一批只覆盖 3 条无 IO 路径：`_lifecyclePayload`（经 `ready` 消息触发）、`_prepareContentForSave`（经 `contentResponse` 触发）、`wordCount` → 状态栏文本（断言 `_refreshStatusBar` 的 `text`）。
3. `vitest.config.ts` 的 `coverage.include` 增加 `src/MarkdownEditorProvider.ts` 与 `src/extension.ts`，阈值先按实测值设（不设 70%，避免倒逼写无意义用例），并补 `shared/__tests__/constants.test.ts` 测 `extractUrlScheme` 的 6 种输入（`https:`/`HTTP:`/`javascript:`/`file:`/无 scheme/空串）。

---

### A7｜死代码与无效导出（grep 交叉验证）

判定口径：`git grep -n -w <符号> -- src shared webview`，剔除「定义文件自身」与 `__tests__`。

**7.1 只写不读的字段**

```ts
// src/MarkdownDocument.ts
5:  private _isDirty = false;
26: this._isDirty = true;      // update()
37: this._isDirty = false;     // save()
56: this._isDirty = false;     // revert()
```

`git grep -n "_isDirty" -- src` 只有这 4 行，**无任何读取**；也没有对外 `get isDirty()`。真正的脏状态由 Provider 的 `_webviewDirty`（`:79`）+ VS Code 的 `_onDidChangeCustomDocument`（`:57`）维护。→ 删，或补 `get isDirty()` 后让 Provider 真的用它（二选一，不许留假字段）。

**7.2 导出但无跨文件非测试引用（15 个，纯类型/常量，可从 `export` 降级）**

| 符号 | 定义 | 说明 |
| :-- | :-- | :-- |
| `MAX_CSS_NUMBER` | `utils/webviewConfigSanitize.ts:16` | 仅本文件默认参数用到 |
| `PathPrimitives` | `utils/pathGuard.ts:16` | 仅本文件签名用到 |
| `SaveImageResult` | `utils/imageService.ts:82` | 仅本文件返回类型 |
| `ImageLocalDirInput` | `utils/imageLocalDir.ts:19` | 仅本文件入参 |
| `ImageLocalDirPlan` | `utils/imageLocalDir.ts:30` | 仅本文件返回类型 |
| `ImageServerIssueKind` | `utils/imageServerConfig.ts:36` | 仅本文件 |
| `ImageServerResolution` | `utils/imageServerConfig.ts:52` | 仅本文件 |
| `LocalizableIssueMessage` | `utils/imageServerConfig.ts:59` | 仅本文件 |
| `ServerStorageOrigin` | `utils/imageServerConfig.ts:220` | 仅本文件 |
| `LegacyImageServerSettings` | `utils/imageServerConfig.ts:29` | 仅本文件 |
| `ExternalChangeAction` | `utils/externalChangeDecision.ts:42` | 仅本文件 |
| `ExternalChangeDecision` | `utils/externalChangeDecision.ts:50` | 仅本文件 |
| `TableWrapMode` | `shared/tableWrap.ts:4` | **全仓无引用**（webview 侧用的是 `TableWrapVars` 与字符串字面量，`webview/utils/tableWrap.ts:2` 只 import 了 `TableWrapVars`） |
| `activate` / `deactivate` | `extension.ts:46/210` | 由 `package.json` 的 `main` 契约调用，**不算死代码**（列此仅说明 grep 命不中） |

**7.3 只被测试引用（13 个，属「测试 seam」）**

`ExternalChangeContext`、`CANDIDATE_IMAGE_DIRS`、`expandCandidateDirs`、`DEFAULT_IMAGE_SERVER_FIELD_NAME`、`DEFAULT_IMAGE_SERVER_RESPONSE_PATH`、`IMAGE_SERVER_FIELD_NAME_PATTERN`、`sanitizeMultipartText`、`getByPath`、`mimeToExt`、`generateFilename`、`buildRelPath`、`computeLineRanges`、`WebviewHtmlOptions`。

这些不是死代码（生产路径经本文件的公共函数间接触达），但**导出面是给测试的**。建议在定义处加一行 `/** 导出仅为单测（test seam）；生产入口是 X */`，让后续重构者知道收敛边界。

---

### A8｜未 await / 未 catch 的 vscode 调用

```ts
511: vscode.commands.executeCommand("vscode.open", targetUri);          // 无 await 无 catch
712: vscode.env.openExternal(vscode.Uri.parse(message.url));            // 无 await 无 catch
775: vscode.commands.executeCommand('workbench.action.openSettings', 'epytor');  // 无 await 无 catch
```

三者都是 `Thenable`：`openExternal` 在无关联应用时 reject（`http:` 正常，`mailto:` 在没配邮件客户端时常见）；`openSettings` 在极老宿主上可能不存在。当前它们位于 `switch` 分支内、外层无 try/catch（见 A2），所以失败 = 静默 + 未处理拒绝。

**建议动作**：抽一个 6 行小工具

```ts
function fireAndLog(p: Thenable<unknown>, what: string): void {
    void p.then(undefined, (e) => console.error(`[epytor] ${what} failed:`, e));
}
```

三处替换，一个可提交改动。

---

### A9｜静默失败（无用户可见反馈）

```ts
// 图库列举：目录读不到 → 静默空列表  :1269-1286
1269: try {
1270:     const entries = await vscode.workspace.fs.readDirectory(targetDir);
...
1285: } catch { /* directory not accessible */ }

// 图片路径解析：整个方法体一个 catch  :1450-1464
1450: try {
...
1464: } catch { /* 路径非法，不响应 */ }
```

`1285` 的后果：用户点「项目图片」，面板显示「没有图片」——与「目录里确实没图」不可区分。`1464` 的后果：webview 侧要等超时兜底（`shared/constants.ts` 的 `PATH_SUGGESTION_TIMEOUT_MS` 5s）。

**建议动作**：`1285` 改为 `notify(panel, l10n.t('Cannot read image folder: {0}', err.message))`（协议里已有 `notice` 消息 `shared/messages.ts:62`，零协议改动）；`1464` 在同提交内加 `console.warn`，是否回错误消息取决于 webview 侧能否处理（未验证，标注留给 webview 负责人）。

---

### A10｜`_prepareContentForDisplay`：名字与副作用不符

```ts
1101: private _prepareContentForDisplay(
1102:     content: string,
1103:     document: MarkdownDocument,
1104:     panel: vscode.WebviewPanel,
1105:     uriKey: string,
1106: ): string {
1107:     const { frontmatter, body } = extractFrontmatter(content);
1108:     this._frontmatterMap.set(uriKey, frontmatter);        // ← 副作用 1：写共享状态
1110:     content = convertTableBrForDisplay(body);             // ← 入参重赋值
...
1133:         this._registerImageMapping(uriKey, webviewUri, rawSrc);   // ← 副作用 2：写共享状态
```

3 个调用点（`:583` watcher、`:640` ready、`:1006` revert）都依赖这两个副作用：随后的 `_lifecyclePayload` 读 `_frontmatterMap`（`:1029`）、`_prepareContentForSave` 读两个 map（`:1156-1157`）。结果是「想单独测显示转换」就必须造出整个 Provider 状态。

**建议动作**：拆为

```ts
export function buildDisplayContent(   // 纯函数，进 utils/contentTransform.ts
    content: string,
    ctx: { mdDir: string; workspaceRoot?: string; toWebviewUri: (abs: string) => string },
): { display: string; frontmatter: string; uriMap: Array<[string, string]> };
```

调用方显式写回两个 map（3 行）。`toWebviewUri` 注入 `panel.webview.asWebviewUri`，测试里传恒等函数即可。**此拆分顺便让 A6 的第 2 步少一条硬依赖。**

---

### A11｜常量重复与魔术数

```ts
1244: const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.ico']);
1405: const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.tiff', '.ico']);
```

字面完全相同、同文件内、相距 160 行。另有：

- `:1420` `.slice(0, 15)`——补全条数上限，无常量名
- `:1404` `IGNORE` 集合（`node_modules`/`.git`/`dist`…）内联，webview 侧若也有同类忽略列表则会再次漂移（webview 未审，标注）
- `utils/imageService.ts:50` `Math.random().toString(36).slice(2, 6)`——随机后缀长度
- `utils/imageService.ts:11` `MAX_ALT_TEXT_LENGTH = 20`（已常量，好）

**建议动作**：`IMAGE_EXTS` 提到 `shared/constants.ts`（webview 的图片选择器大概率也需要，属双向共享）；新增 `PATH_SUGGESTION_LIMIT = 15` 与 `FILENAME_RANDOM_SUFFIX_LEN = 4`。一个提交。

---

### A12｜`fs` 双导入与同步 IO

```ts
1:    import * as fs from "fs";                      // 静态
523:  import("fs").then(({ watch: fsWatch }) => {     // 动态（同一模块）
1459: if (!fs.existsSync(absPath)) { return; }        // 同步阻塞，在消息处理链上
```

`:1459` 在每一条 `resolveImagePath` 消息上做一次同步 `stat`。Extension Host 是单线程 JS：目录在慢盘/网络盘（OneDrive 占位符）上时，这条同步调用会阻塞所有扩展的消息处理。同文件的 `_handleGetProjectImages`（`:1270`）与 `_refreshFileSize`（`:849`）都用 `vscode.workspace.fs`（异步、可被 mock），只有这里用了 Node 同步 API。

**建议动作**：`:1459` 改 `await vscode.workspace.fs.stat(vscode.Uri.file(absPath)).then(() => true, () => false)`，方法体改 `async`（调用点 `:822` 现在是不 await 的同步调用 `this._handleResolveImagePath(...)`，改 async 后补 `.catch` 即可）；静态/动态 import 统一为静态一处。**注意**：`fs.watch` 必须用 Node API（`vscode.workspace.createFileSystemWatcher` 看不到同 Host 写入，注释 `:521-522` 已说明），所以不要顺手改掉——只统一导入方式。

**附带风险（如实标注，当前不可达）**：watcher 的建立与 `onDidDispose` 注册都在 `import("fs").then(...)` 回调里（`:523-604`），即「注册清理逻辑」本身被推迟了一个微任务。当前 `fs` 已在 `:1` 静态导入，`import()` 立刻 resolve，因此**实际不可达**；但一旦有人把它改成真正延迟加载（例如为了省启动开销），快速关面板就会走到「`onDidDispose` 在已销毁的 panel 上注册 → 永不触发 → `fsWatcher` 泄漏」。修法：`fs.watch` 同步建立，`onDidDispose(() => fsWatcher.close())` 在 `_registerFileWatcher` 返回前注册，不放进 promise 回调。

---

### A13｜测试文件命名与模块不符

```ts
// src/__tests__/contentTransform.test.ts:10
import { computeLineRanges, computeDisplayLineRanges } from "../../src/utils/lineMap";
```

`:151-303` 两个 `describe`（`computeLineRanges` 18 个 it、`computeDisplayLineRanges` 4 个 it）测的是 `src/utils/lineMap.ts`，而该文件 83 行、含 mdast 解析 + 单条缓存（`:44-45`）+ frontmatter 偏移，是全项目最「有逻辑」的 utils 之一。

**建议动作**：纯移动，拆到 `src/__tests__/lineMap.test.ts`；`contentTransform.test.ts` 行数从 460 降到 ≈300。移动后 `coverage` 的 `"src/utils/lineMap.ts": { lines: 90 }` 阈值不变（本来就是按文件配的）。一个提交，零逻辑改动。

---

### A14｜格式化缺陷

```ts
1156: private _prepareContentForSave(content: string, uriKey: string): string {        const frontmatter = this._frontmatterMap.get(uriKey) ?? "";
```

花括号后接 8 个空格再接语句（疑似某次编辑残留）。合并进 A10 的拆分提交即可。

---

### A15｜算出来却被丢弃的「安全降级」信号

```ts
// utils/imageLocalDir.ts:56-71
65: if (resolved && (!workspaceLevel || (allowedBase !== null && isPathWithinBase(resolved, allowedBase)))) {
66:     return { kind: "fixed", dir: resolved, downgraded: false };
67: }
68: return docDir
69:     ? { kind: "fixed", dir: path.join(docDir, "images"), downgraded: true }   // ← 越界，已降级
70:     : { kind: "probe", candidates: [], fallbackDir: null };
```

`git grep -n "downgraded" -- src` 的非测试结果只有 `MarkdownEditorProvider.ts:1181,1183,1194`（这是图床的**另一个**同名局部变量）与 `utils/imageLocalDir.ts:32,66,69`（定义）。真正的读取方是 `imageLocalDir.test.ts` 的 5 个断言。两个生产调用点：

```ts
// utils/imageService.ts:109-114
109: if (plan.kind === "fixed") {
114:     targetDir = vscode.Uri.file(plan.dir);        // 不区分是否降级
// MarkdownEditorProvider.ts:1257-1258
1257: if (plan.kind === 'fixed') {
1258:     targetDir = vscode.Uri.file(plan.dir);        // 同上
```

对比图床路径的同类降级是有反馈的：

```ts
1183: if (downgraded) {
1184:     panel.webview.postMessage({
1185:         type: 'notice',
1186:         message: vscode.l10n.t('Uploading to the image server was skipped because ...'),
1187:     });
```

**影响**：同一类「因为安全所以降级」的动作，一条有提示一条没有。用户在恶意仓库里粘贴图片、文件却落到 `images/`，只会觉得「配置没生效」。**建议动作**：在两个调用点各加 3 行（`if (plan.downgraded) notify(...)`），文案复用图床那条的中文/英文风格。一个提交。

---

### A16｜跨边界类型未收敛（同表内口径不一致）

```ts
// src/extension.ts:21-28
21: {
22:     section: "epytor.serializationMode",
23:     message: (value) => ({ type: "setSerializationMode", mode: sanitizeSerializationMode(value) }),   // 收敛到枚举
24: },
25: {
26:     section: "epytor.tableWrapMode",
27:     message: (value) => ({ type: "tableWrapModeChanged", mode: typeof value === "string" ? value : "wrap" }),  // 任意字符串直通
28: },
```

`shared/tableWrap.ts:25-32` 的 `resolveTableWrapVars(mode: string)` 用 `switch` + `default` 兜底，所以**当前不会出错**；但 `ToWebviewMessage` 里这条消息的字段是 `mode: string`（`shared/messages.ts:56`），语义是「已净化的配置值」却没有类型或函数保证。项目里已有 `TableWrapMode`（`shared/tableWrap.ts:4`）却全仓无人使用（A7）。

**建议动作**：`shared/tableWrap.ts` 加

```ts
export function normalizeTableWrapMode(value: unknown): TableWrapMode {
    return value === "nowrap" || value === "none" ? "nowrap" : "wrap";   // 与 resolveTableWrapVars 的旧值迁移口径一致
}
```

`extension.ts:27` 改用它，`shared/messages.ts:56` 字段类型改 `TableWrapMode`，`resolveTableWrapVars` 签名收窄为 `TableWrapMode`（保留 `"none"` 迁移分支或用 normalize 后丢弃）。同时把 A7 里「全仓无引用」的 `TableWrapMode` 变成真在用。一个提交。

---

## 三、最该先做的三件事（含理由）

1. **A1 状态收敛（`DocumentState` + 单点 dispose）**——这是唯一一条「既修 bug 温床又给后续重构腾地」的改动。18 个容器里现在有 6 个在面板销毁后残留，其中 `_webviewDirty` 残留会经 `:426` 触发「失活即落盘」并接上 `:319` 的「编辑器无响应」警告；而 A2/A3/A10 的所有拆分都要求先有一份「一个文档的完整状态」，否则搬出去的每个方法都要带 6-8 个 Map 参数。
2. **A2 消息入口兜底（一个 6 行 try/catch + 4 处空 catch 改日志）**——成本最低、收益最直接：当前任何一处 `postMessage` 竞态都会变成无日志的未处理拒绝；这条也是项目 AGENTS 里已经点名的「当前出入」，修完即可从文档里删掉这条待办。
3. **A3 第一步：图片编排外移**——`_handleWebviewMessage` 231 行里，图片 5 个方法（`:1147`、`:1161`、`:1237`、`:1291`、`:1439`）+ 2 个 warn 方法已经**自成边界**（只依赖 `panel`/`document`/`uriKey`/`_imageUriMaps`），机械外移不需要设计决策，也不需要改行为；搬完 `_handleWebviewMessage` 掉 ~60 行，且给 A6 的「Provider 可实例化」铺路（图片 handler 可用假 panel 直接测）。

> A4 的路径解析统一（`src/utils/docPath.ts`）排第 4：它的价值在于让「越界防护只覆盖 1/4 路径」这件事收敛成一处，但会改变 `@/` 无 workspace 时的回退口径，属于**行为变更**，需要 owner 先定口径（目前 ① 回退父目录、②③④ 回退文档目录，两者对 `@/x.png` 会解析到不同文件）。

---

## 四、附录：验证命令与原始输出

```text
# 基线
git -C epytor branch --show-current        → dev
git -C epytor log --oneline -1             → 252b647 docs: 发布前定版——1.2.7…
git -C epytor status --porcelain | wc -l   → 32（未提交改动，审计前后一致，未修改任何文件）

# 行数（Raw 内容按 \n 切分）
1466 src/MarkdownEditorProvider.ts   300 src/utils/imageService.ts
 280 src/utils/imageServerConfig.ts  210 src/extension.ts
 122 src/utils/contentTransform.ts    83 src/utils/lineMap.ts
  79 src/MarkdownDocument.ts          53 src/utils/webviewHtml.ts

# 类型逃生（非测试源码）
git grep -n --perl-regexp "\bany\b|as unknown as|as any" -- src shared   → 1 命中（lineMap.ts:50）
git grep -n --perl-regexp "\w\!\.|\w\!\)|\]\!\." -- src shared          → 0
git grep -n --perl-regexp "@ts-ignore|@ts-expect-error|eslint-disable"   → 0

# 死代码交叉验证（逐导出符号 grep，剔除定义文件与 __tests__）
15 个导出无跨文件非测试引用；13 个导出仅被测试引用（清单见 §A7）

# 测试清单（src/__tests__ + shared/__tests__ 共 16 文件 / 246 用例，实测全绿；
#          webview/__tests__ 另有 56 文件，合计 72 文件 / 655 用例）
无 markdownEditorProvider.test.ts / lineMap.test.ts
```

`pnpm test` 基线结果：**见下方「测试基线」一节（本次运行写入）**。

### 测试基线（2026-10-27 本机实测）

```text
# 只跑 extension 侧（本次审计范围）
$ pnpm exec vitest run --project extension
 Test Files  16 passed (16)
      Tests  246 passed (246)
   Duration  22.20s                                    exit code 0

# 全仓（含 webview，72 个测试文件）
$ pnpm test
 Test Files  72 passed (72)
      Tests  655 passed (655)
      Errors  8 errors       ← 全部是 "[vitest-pool]: Failed to start forks worker /
   Duration  314.94s            Timeout waiting for worker to respond"
   exit code 1
```

结论与诚实标注：

1. **本审计范围内的 16 个文件 / 246 个用例全部通过**，可作为改动前基线。
2. 全仓运行出现 8 个 **worker 启动超时**（不是断言失败，655 个用例全 passed），退出码 1。这**大概率是本机资源/并发环境问题**（72 文件 × jsdom，environment 累计 752s），**未做第二次复现，不能据此判定 CI 会红**。但它说明：本机跑 `pnpm test` 不能直接当「绿」的依据，验证时建议 `--project extension` 与 `--project webview` 分开看，或至少确认 `Errors` 段为 0。
3. 覆盖率未运行（未跑 `test:coverage`）；§A6 的「provider 不在分母」结论来自 `vitest.config.ts:35-40` 的**静态配置**，不依赖运行结果。
