# 上游限制

> 上游（Milkdown / Crepe / ProseMirror / VS Code 宿主）里 epytor **无法自行修复、只能绕过**的问题。每条只留：限制 → epytor 侧现状 → issue 追踪 → 升级复验要点；排查过程与读数放分册（`docs/audits/`、spec、tech-debt），不往这里堆。
>
> **最近验证：2026-10-18（Milkdown 7.22.3 / VS Code 1.137）**。上游 issue：open = `#2413` `#2414` `#2415` `#2475`；已提 = [#2499](https://github.com/Milkdown/milkdown/issues/2499)；已修 = `#2451`（7.22.1）、`#2463`（7.22.2）。
> **README 只镜像「用户可见」项**（README 已知限制末尾链接本文件），内部细节留这里。

| # | 上游行为 | 用户可见 | 来源 | epytor 侧现状 / 追踪 / 升级复验 |
|---|---|---|---|---|
| 1 | 行内样式（粗体/斜体/删除线/行内代码）在段落末尾无法退出 | ✘ 已解决 | Milkdown [#2413](https://github.com/Milkdown/milkdown/issues/2413)（open） | 自注册官方 cursor 插件 + vendored 虚拟光标（`editor.ts`、`vendor/prosemirrorVirtualCursor`）+ inlineCode `inclusive:false`（7.22.1 起）。复验：`inlineCodeArrowProbe`、`upstreamRegression` |
| 2 | 有序列表各层都用十进制编号（不区分 a) / i.） | ✔ 显示层绕开 | Milkdown [#2415](https://github.com/Milkdown/milkdown/issues/2415) / [#2475](https://github.com/Milkdown/milkdown/issues/2475)（open） | `listMarkerPlugin` + `listMarkers.css` 按层级重绘（●/■/◆ 与 1./a)/i.，见 `docs/specs/2026-09-12-word-style-multilevel-markers.md`）。复验：依赖 Crepe 的 `.label.*` 结构与 CSS 变量；上游若把 depth 透给 `renderLabel` 就改用官方并删本 workaround |
| 3 | Crepe 表格单元格单击进入编辑而不是选中整格 | ✘ 按设计改写 | Crepe [#2414](https://github.com/Milkdown/milkdown/issues/2414)（open） | `utils/cellClickState.ts`：单击 → 光标进格、跨格/整行拖选保留多选；有意的交互选择，**不算已知限制** |
| 4 | 保活 webview 切标签时「整块闪一下」：激活首帧由宿主重绘，页面侧贡献 0 | ✘ owner 决定 README 不提 | VS Code host [vscode#113188](https://github.com/microsoft/vscode/issues/113188) | 平台行为，扩展侧无着力点；**定案接受**（保活是产品原则）。读数与实验见 `docs/audits/2026-09-11-tab-switch-flicker-measurement.md` |
| 5 | 空任务项（`- [ ] ` 标记后无内容）不被识别成复选框：`checked` 停在 null、`[ ]` 留成正文、写回被转义 | ✘ 已解决 | Milkdown（micromark 任务标记要求后有内容） | 上游未提 issue。`utils/emptyTaskListItem.ts`（解析后补齐 mdast）+ `markdownSerializer.stripListItemBreakPlaceholder`（擦掉序列化 `<br />` 占位）。复验：上游支持空标记后整层删除（`checked` 已是布尔值时自动让位） |
| 6 | 「打开方式…」里自定义编辑器名必为「<编辑器名> - <扩展名>」两段 | ✘ owner 按此定名 | VS Code 工作台 | 上游设计非 bug。`displayName` 定为「Markdown Editor / Markdown 编辑器」，菜单行「Markdown Editor - EPYTOR」；契约由 `manifest.test.ts` 钉住。**别再尝试只显示单段**（v1.1.x~1.2.0 曾误判为 nls/去重问题） |
| 7 | 任务项回车：新项继承原项勾选态（`itemAttrs` 未传 → 复制 attrs） | ✘ 已解决 | ProseMirror `prosemirror-schema-list` / Milkdown `listItemKeymap` | **已提 [#2499](https://github.com/Milkdown/milkdown/issues/2499)**（与第 9 条合并）。`utils/taskListItemEnter.ts`：项末尾走官方 `splitListItem(itemType, itemAttrs)`、项中间显式 `typesAfter`。复验：上游应用 `itemAttrs` 后显式分支可回收；7.22.1 基线同样复现 |
| 8 | VS Code 市场图标 **1024 KB 上限**（2026-10 收紧） | ✘ 已解决 | VS Code Marketplace（vsce 上传阶段报错） | 图标无损重编码 1,050,983 → **33,731 字节**（512×512 ARGB，像素逐字节一致）。**换图标必须核 ≤1024 KB**（v1.2.3 首发因此被拒，修后同版本号重发、tag 重建） |
| 9 | 嵌套任务列表里空任务项回车 → 变普通圆点项（`splitListItem` 空项分支用 `createAndFill()` 造默认 attrs、**忽略 `itemAttrs`**） | ✘ 已解决 | ProseMirror（同上）/ Milkdown | **已提 [#2499](https://github.com/Milkdown/milkdown/issues/2499)**（正文含 PM 根因）。`taskListItemEnter.ts`：空任务项改为 `liftListItem` 提升一级（顶层即退出列表），不产生圆点项。复验：上游修空项分支或 Milkdown 传 `itemAttrs` 后本插件可简化。**PM 侧无 GitHub 渠道**（仓库已归档，迁 `code.haverbeke.berlin`；论坛同需账号） |

**已解决的历史条目**（上游已修，留档备查）：

* [Milkdown#2451](https://github.com/Milkdown/milkdown/issues/2451) 行内代码 mark 改为非 inclusive —— **7.22.1 已修**，断言见 `webview/__tests__/upstreamRegression.test.ts`。
* [Milkdown#2463](https://github.com/Milkdown/milkdown/issues/2463) 加载时保留单元格内手写 `<br>` —— **7.22.2 已修**；epytor 的四层 workaround（`convertTableBrForDisplay` / `withTableBreakHandler` / `cleanTableBreaks` / `preserveTableBreakStyle`）暂留，已登记 tech-debt 待拆链（7.22.3 复验：`tableBrRoundtrip` / `tableSoftBreak` / `saveFidelity` 全绿）。**注意**：7.22.2 起空段落改用 `<br />` 占位，列表项首块非段落时有上游回归（[PR#2487](https://github.com/Milkdown/milkdown/pull/2487) 未修）；epytor 的 `stripListItemBreakPlaceholder` 正好挡住，已有回归用例。

> 自动化只覆盖可自动化的部分（行内代码 mark 的 inclusive、列表编号重排），其余需手测；见 `webview/__tests__/upstreamRegression.test.ts` 文件头。
