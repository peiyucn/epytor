# epytor

> Forked from [git-xing/md-wysiwyg-editor](https://github.com/git-xing/md-wysiwyg-editor) (MIT)
> 
> 源项目更新较慢，此 fork 暂不计划向源项目提交 PR，专注于修复 bug 并克制地增加功能。

简体中文 | [English](README.md) | [GitHub](https://github.com/peiyucn/epytor)

一款基于 [Milkdown](https://milkdown.dev/)（ProseMirror）的 VSCode 所见即所得 Markdown 编辑器扩展，以富文本方式直接编辑 `.md` / `.markdown` 文件，保存结果为标准 Markdown，与任何文本编辑器完全兼容。

### 项目起点

本项目的首个版本为 **1.0.0**，以源项目 [v0.1.6](https://github.com/git-xing/md-wysiwyg-editor/releases/tag/v0.1.6) 为基础，主要增加了字数统计、TOC 面板增强，并修复了编辑时空行错位的 bug。所有标识（viewType、命令、配置键）从 `markdownWysiwyg.*` 改为 `epytor.*`，可与源扩展共存。

---

## 功能特性

### 富文本编辑

- **标题**（H1–H6）、**粗体**、*斜体*、~~删除线~~、`行内代码`、引用块、分割线
- **有序列表 / 无序列表 / 任务列表**（点击复选框切换完成状态）
- **链接**：悬停显示预览弹框，可直接修改链接文本和 URL；支持 `@/` workspace 路径、`#` 页内锚点跳转，以及 `file.md#27` 行号跳转
- **路径自动补全**：在 inline code 中输入 `@/`、`./`、`../` 等前缀，自动显示路径补全建议；分级目录浏览，带彩色文件类型图标

### 表格

- 完整的 GFM 表格支持
- 悬停行/列边框显示 **+ 插入线**，一键在任意位置插入行或列
- 行/列 **拖拽 handle**，点击选中整行/整列，拖拽即可重新排序
- 输入内容撑大表格后，插入线与 handle 实时跟随更新位置

### 代码块

- 语法高亮（支持 20+ 语言：Bash、C、C++、C#、CSS、Go、HTML、Java、JavaScript、JSON、Markdown、PHP、Python、Ruby、Rust、SQL、Swift、TypeScript、YAML）
- 顶部语言选择器（含搜索筛选）
- 一键复制代码按钮
- 拖拽底部 handle 调整代码块显示高度
- 全屏编辑器，含语法高亮；关闭时写回文档

### Mermaid 图表

- 流程图、时序图、甘特图、类图等内联渲染
- 源码与预览之间一键切换
- 支持缩放、平移（拖拽 / 触控板捏合），以及全屏 lightbox

### 图片

- 支持从剪贴板**粘贴**、**拖放**文件，或通过**文件选择器**插入图片
- 本地存储（MD5 去重），或配置自定义服务器上传地址
- 点击图片选中，再次点击放大到 lightbox 预览
- 工具栏支持编辑 alt 文本、重命名文件、删除图片

### 目录（TOC）

- 自动从文档标题生成目录面板
- 窗口宽度充足时自动展开；点击侧边 Tab 手动切换
- 点击条目平滑滚动至对应标题

### 工具栏

- 顶部固定工具栏：标题级别、加粗、斜体、删除线、有序/无序列表、任务列表、引用、代码块、表格
- **选中文字浮动工具栏**：选中文字后弹出，支持快速格式化及发送到 Claude
- **表格工具栏**：选中行/列后弹出，支持对齐、插入/删除行列

### Claude 集成

- **`Option+K`**（macOS）/ **`Alt+K`**（Windows）：将光标所在段落发送到 Claude 对话，自动附带精确文件行号
- 选中文字后点击工具栏「发送到 Claude」按钮，同样附带行号范围
- 自动识别 Claude 终端 / Claude VSCode 扩展 / VSCode 内置 Chat，三级降级兜底

### 编辑器内搜索

- **`Cmd+F`**（macOS）/ **`Ctrl+F`**（Windows）：唤出 FindBar，在文档内搜索关键词
- 使用 CSS Custom Highlight API 实时高亮所有匹配项
- `Enter` / `Shift+Enter` 上下导航，`Esc` 关闭

### 自动保存

- 默认停止编辑 **1 秒**后自动写盘，无需手动 `Cmd+S` / `Ctrl+S`
- 支持关闭自动保存，手动保存（标题栏显示 `●`）
- 外部文件变更自动同步到编辑器（如 `git checkout`、其他编辑器修改）

---

## 快速上手

安装扩展后，在 VSCode 中打开任意 `.md` / `.markdown` 文件，将自动以 WYSIWYG 模式打开。

| 操作           | 方式                                  |
| ------------ | ----------------------------------- |
| 切换到文本编辑器     | 点击标题栏 👁 图标，或右键文件 → 打开方式            |
| 切换回 WYSIWYG  | 点击标题栏 👁 图标                         |
| 插入行/列        | 鼠标悬浮表格行/列边框，点击 **+**                |
| 拖拽重排行/列      | 悬浮 **⠿** handle 后拖拽                 |
| 选中整行/整列      | 点击 **⠿** handle                     |
| 路径自动补全       | 在 inline code 中输入 `@/`、`./` 或 `../` |
| 发送段落到 Claude | `Option+K`（macOS）/ `Alt+K`（Windows） |
| 文档内搜索        | `Cmd+F`（macOS）/ `Ctrl+F`（Windows）   |
| 手动保存         | `Cmd+S`（macOS）/ `Ctrl+S`（Windows）   |

---

## 设置

| 设置项                                  | 类型      | 默认值         | 说明                                                   |
| ------------------------------------ | ------- | ----------- | ---------------------------------------------------- |
| `epytor.autoSave`           | boolean | `true`      | 编辑后自动写盘                                              |
| `epytor.autoSaveDelay`      | number  | `1000`      | 自动保存防抖延迟（毫秒）                                         |
| `epytor.defaultMode`        | string  | `"preview"` | 打开 `.md` 的默认模式：`preview`（WYSIWYG）或 `markdown`（文本编辑器） |
| `epytor.codeBlockMaxHeight` | number  | `600`       | 代码块最大显示高度（像素）                                        |
| `epytor.editorMaxWidth`     | number  | `900`       | 编辑器内容最大宽度（像素）                                        |
| `epytor.fontFamily`         | string  | `""`        | 编辑器字体，留空继承 VSCode 编辑器字体，示例：`Georgia, serif`          |
| `epytor.imageStorage`       | string  | `"local"`   | 图片存储模式：`local`（本地保存）或 `server`（上传至自定义 URL）           |
| `epytor.imageLocalPath`     | string  | `""`        | 本地图片存储路径（相对于 workspace 根目录）                          |

---

## 环境要求

- VSCode **1.80.0** 及以上

---

## 已知限制

- 部分复杂 Markdown 扩展语法（如脚注、数学公式）尚未支持

- **链接弹窗撤销**（`Cmd+Z` / `Ctrl+Z`）：在链接 URL / 文字输入框内，撤销操作被 VS Code Electron 层拦截，暂无法使用

- **表格单元格行号**（发送到 Claude）：选中表格单元格时，上报的行号范围可能偏差，根因是 ProseMirror 节点索引与源码行号映射不对齐

- **全局搜索跳转**：点击 `.md` 文件的全局搜索结果时，若同时打开多个 `.md` 文件，WYSIWYG 编辑器可能无法精确跳转到匹配行
