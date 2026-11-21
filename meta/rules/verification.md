# 验证与审计规范

## QG 质量门禁

QG 规则由 `npm run lint:policy` 执行；项目不得删条目、改 ID、自行标 N/A 或只写成文字说明。

| ID | 级别 | 检查 | 防止的错误 | 负例 | 执行入口 |
|---|---|---|---|---|---|
| QG001 | `final` | 必读文档存在：AGENTS、README / CHANGELOG、SECURITY、架构 / 规格 / 发布 | 文档遗漏、仓库不可独立维护 | 删掉一个必读文档，检查必须失败（`test/policy-lint.test.ts` QG001） | `npm run lint:policy` |
| QG002 | `final` | 用户配置文档的键名与顺序 = 配置 schema | 配置文档与实现漂移 | 让配置表键名或顺序漂移，检查必须失败（`test/policy-lint.test.ts` QG002） | `npm run lint:policy` |
| QG003 | `final` | 工具链版本声明（engine 与类型包）一致 | 类型面漂移到运行时不支持的 API | 让 engine 与类型包版本不一致，检查必须失败（`test/policy-lint.test.ts` QG003） | `npm run lint:policy` |
| QG004 | `final` | 中英文文档互相链接 | 双语文档失去入口 | 去掉任一侧互链，检查必须失败（`test/policy-lint.test.ts` QG004） | `npm run lint:policy` |
| QG005 | `final` | CHANGELOG 最新版本 = 项目版本 | 发布内容不完整 | 让 CHANGELOG 缺少当前版本，检查必须失败（`test/policy-lint.test.ts` QG005） | `npm run lint:policy` |
| QG006 | `final` | `verify` 必须先跑 lint | 检查链被绕过 | 从 `verify` 去掉 lint，检查必须失败（`test/policy-lint.test.ts` QG006） | `npm run lint:policy` |
| QG007 | `final` | CI job 只使用 E24 规定的环节名称；实际环节与顺序 = engineering.md 的 E 工程管线第一段子项目对照 | 自创环节、管线登记失真 | 增加未知 job 或让 workflow 与登记不一致，检查必须失败（`test/policy-lint.test.ts` QG007） | `npm run lint:policy` |
| QG008 | `final` | publish 使用发布 environment；发布安全门禁在打包前；tag 提交必须在默认分支 | 绕过安全门禁或从未合并提交发版 | 把安全门禁移到打包后或从非默认分支发版，检查必须失败（`test/policy-lint.test.ts` QG008） | `npm run lint:policy` |
| QG009 | `final` | 构建/发布产物不进 git，也不进发布包 | 产物污染仓库或发布包 | 把产物加入 git 或发布包，检查必须失败（`test/policy-lint.test.ts` QG009） | `npm run lint:policy` |
| QG010 | `final` | 测试中不得提交 `.only()` | 只跑一个用例却显示全绿 | 提交一个 `.only()`，检查必须失败（`test/policy-lint.test.ts` QG010） | `npm run lint:policy` |

## L 代码检查

L 是 lint 检查的登记前缀；E 已用于工程管线，代码检查不再复用 E001–E005。L 规则由 `npm run lint:code` / `npm run lint:policy` / `check-project-contract` 执行；项目不得删规则、加注释或用别的命令替代。

| ID | 级别 | 检查 | 防止的错误 | 负例 | 执行入口 |
|---|---|---|---|---|---|
| L001 | `final` | 禁止 `exec` / `execSync`：外部输入不得经过 shell | 拼接命令导致用户路径变成第二条命令 | 从 `node:child_process` 导入 `exec`，检查必须失败（`meta/lint/eslint-base.mjs` no-restricted-imports） | `npm run lint:code` |
| L002 | `final` | 禁止 `shell: true` | 参数经 shell 重新解析 | 给 `spawn` 传 `shell: true`，检查必须失败（`meta/lint/eslint-base.mjs` no-restricted-syntax） | `npm run lint:code` |
| L003 | `final` | 纯逻辑模块不得导入宿主/运行时 API；纯逻辑目录由项目 `Interface` 声明 | 纯逻辑层失去可单测性 | 在纯逻辑目录导入 `vscode`，检查必须失败（`meta/lint/eslint-base.mjs` 的 pureLogicDir 规则） | `npm run lint:code` |
| L004 | `final` | 禁止显式 `any`：外部数据先在边界解析，再进入内部类型 | 类型边界失守 | 在源码写一个显式 `any`，检查必须失败（`meta/lint/eslint-base.mjs` no-explicit-any） | `npm run lint:code` |
| L005 | `final` | lint 基线：ESLint recommended + typescript-eslint recommended 全开 | 基础规则被删，检查形同虚设 | 引入一个未使用变量，检查必须失败（`meta/lint/eslint-base.mjs` recommended） | `npm run lint:code` |
| L006 | `final` | 禁止注释：源码、测试、脚本与配置不得写注释；只有 owner 明确要求时例外 | 注释与代码漂移，agent 误信注释 | 在 lint 覆盖文件加一行注释，检查必须失败（TS/JS/MJS：`meta/lint/eslint-base.mjs`；YAML/shell/CODEOWNERS/gitignore：`meta/lint/check-comments.mjs`） | `npm run lint:code` / `npm run lint:policy` |
| L007 | `final` | 项目专属 ESLint 只能放在项目 `meta/lint/project-eslint.mjs`；项目根不得有 `eslint.config.mjs`；没有专属配置时直接使用共享 `meta/lint/eslint-base.mjs` | 配置散落根目录、项目间漂移 | 在项目根放 `eslint.config.mjs`，或在 `meta/lint/project-eslint.mjs` 之外放项目 ESLint 配置，检查必须失败（`check-project-contract.mjs` L007） | `node meta/scripts/check-project-contract.mjs` |

QG 的负例先写失败场景，再写文件与测试 ID；项目契约校验会检查 `test/policy-lint.test.ts` 和 QG001–QG010。L001–L006 的负例由 `meta/lint/` 的共享实现直接执行；L007 由项目契约校验执行。项目 `meta/lint/project-eslint.mjs` / `scripts/check-policy.mjs` 调用共享实现。执行入口是上表的标准命令，不是 `verify` 泛称；`verify` 只是总入口。不得为了通过而删负例、改入口或让命令空跑。

## G 代码审计

G1–G8 全部为〔final〕：项目只能加严，不能放宽。

发布前与全面检查时，按以下逐条过一遍。

### G1｜文档对齐〔final〕

文档与实现、声明一一对应。CHANGELOG 覆盖本版本全部可感知改动。

### G2｜死代码与残留〔final〕

导出符号与常量须确认调用方。清理未使用的 import、变量、类型字段、CSS 类。

不保留注释掉的代码；不保留调试脚手架（`debugger`、临时日志、临时开关、调试入口）。

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

用户可见改动须有实际运行证据：截图、DOM、控制台、网络记录或 CLI 输出。
