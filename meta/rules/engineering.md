# 工程管线

## E 工程管线

meta-repo 根 `README.md` 的项目清单中档位为全量或精简的仓库共用的流程标准。

### 子项目对照

| 项目 | 开发分支 | CI | 发布 | 部署 / 同步 |
|---|---|---|---|---|
| dsh-launcher-panel | main | `typecheck` → `test` → `build` → `package` | `publish`（vsce + GitHub Release） | — |
| epytor | main | `typecheck` → `test` → `build` → `package` | `publish`（vsce + GitHub Release） | — |
| dsh-sparrow | main | `typecheck` → `build` → `test` → `package` | `publish`（npm；不建 Release） | `deploy`（`market.yml`，发布 `dsh.pyai.site`） |
| pyai.site | main | `typecheck` | `deploy`（build + Pages，push main 即部署） | `sync`（`daily-sync.yml`，cron） |

有测试的仓库，test job 须输出报告。发布工作流统一命名 `publish.yml`。无 CI 的仓库不列入本表。

### E1｜建仓库〔constructor〕

owner 用 `gh` 创建仓库，按用途选公开或私有；agent 不代建仓库。

### E2｜配置仓库设置〔constructor〕

按 [repo-settings.md](repo-settings.md) 的 F 段配置安全开关、分支保护与合并设置，再按 F4 逐项核验。

### E3｜放置工作流〔constructor〕

`ci.yml` 承接 push/PR，`publish.yml` 承接发布。环节按 E24 命名，只放该项目真实存在的。触发方式按发布形态定。

### E4｜创建部署环境〔constructor〕

environment 设置按 [repo-settings.md](repo-settings.md) 的 GitHub 控制映射；owner 用 `gh` 创建环境级 environment，名称按发布通道命名；agent 不代建 environment / secret。publish job 须挂该 environment，不设审批门禁，Deployments 页面据此留存发布记录。

托管方提供的内置环境不需要手动创建。

### E5｜放置文档骨架〔constructor〕

`AGENTS.md` 按 base 的继承方式写：文件头声明继承自 `/pyai-meta-repo/AGENTS.md`；`## 1` 从基 AGENTS 逐字复制；`## 2`–`## 5` 按项目实现。同时提供中英双份 README 与 CHANGELOG，写法见 [playbooks/release.md](../playbooks/release.md) 的“文档写法”。无版本语义的仓库可按该项目 `AGENTS.md` 声明豁免。

### E6｜登记〔constructor〕

在 meta-repo 根 `README.md` 的 `## 项目清单` 增加一行（项目本地不维护该清单）。有 CI 或发布流程的，另在本文 E 工程管线第一段的子项目对照增加管线行。owner 发起新增项目即视为许可修改上述登记。

### E7｜分支约定〔overridable〕

日常改动在 `dev` 分支，默认分支统一为 `main`。例外：E 工程管线第一段子项目对照中「开发分支」为 `main` 的单分支项目直接在 `main` 开发；GitLab 仓库沿用现有分支名。分支保护设置见 [repo-settings.md](repo-settings.md) 的 F5。

### E8｜本地一键验证〔interface〕

每个软件项目须在 `package.json` 提供下列四项标准命令；`npm run verify` 覆盖本项目全部检查项：QG、L（定义见 [verification.md](verification.md)）、项目实现的负例和项目自己的检查。无 `package.json` 的文档仓库以 AGENTS 的文档自查清单替代，不适用本表。

| 命令 | 必须做什么 | 失败 |
|---|---|---|
| `npm run lint:code` | 代码静态检查；L001–L005 由此执行 | 非零退出 |
| `npm run lint:policy` | 仓库策略检查；QG001–QG010 由此执行 | 非零退出 |
| `npm run lint` | 先 `npm run lint:code`，再 `npm run lint:policy` | 任一步失败即停 |
| `npm run verify` | 先 `npm run lint`，再按项目 AGENTS 的 `## 3. 实现` 跑类型、测试、构建、打包 | 任一步失败即停 |

- `verify` 是本地唯一总入口；提交、PR、发布前都跑它。
- `lint` 的顺序固定：先代码，后策略。
- QG/L 表的执行入口列直接写上述命令；项目不得把某个检查只写成文档说明而不接进命令。
- 项目契约校验：在 meta-repo 根目录运行 `node meta/scripts/check-project-contract.mjs`。它按 meta-repo 根 `README.md` 的 `## 项目清单` 检查 AGENTS 继承方式（文件头继承来源、`## 1` 逐字继承、`## 2`–`## 5` 实现）、本地 `meta/` 共享层快照（不含 `github-policy.json` / `scripts/`；项目清单在 README，不进快照）、QG 负例文件和 `package.json` 标准命令；输出会列出缺什么，失败即项目还没继承完整。

### E9｜打包产物〔overridable〕

可分发的产物统一放仓库根的 `releases/`，写入 `.gitignore`，确认不进发布包。

输出目录不存在时，打包工具会把目录名当文件名。干净 clone 的仓库没有该目录，须先创建。

不产出可分发包的项目不受本条约束。

### E10｜提交粒度〔final〕

一个 commit 只做一件事。描述用中文，保留英文类型前缀。

PR 说明写清：改了什么、为什么、没改什么、证据、风险、未验证项。

### E11｜推送前置条件〔final〕

push 前须 `verify` 通过，推送到开发分支（见 E7）。agent 的分支用 `git-agent` 推送，保证最后推送者是 agent；owner 不推 agent 分支。

### E12｜push 后核查安全告警〔final〕

push 后立即查询一次未处理的 Dependabot 告警，确认清零才继续。存在告警的，先修复再进入发版流程。

### E13｜代码扫描须按扫描周期核查〔final〕

`verify` 通过、CI 全绿，不代表安全扫描无问题。CodeQL 依赖扫描周期，未出结果不得视为通过，须等本轮扫描完成后再查。

依赖类告警按 E22 处理；代码类告警修复后，须等下一轮扫描确认状态变为已修复再发版。

tag 前须确认 CodeQL default setup 已扫过本轮 main 提交（查 `code-scanning/analyses` 的 `commit_sha`），未扫过则等扫描完成再发；不得用上一次 main 的扫描代替本轮。

### E14｜发布前审计〔final〕

按 G 段逐条过一遍。

### E15｜准备发布内容〔final〕

两份 CHANGELOG 加新版本条目，改版本号文件，README 有功能变更则同步。多包仓库按包各自维护。

### E16｜合并并推送〔final〕

把开发分支合并到默认分支；单分支项目无需合并。

集成分支 → 默认分支的发布 PR 用 **merge commit** 合并，不用 squash：squash 不会让集成分支成为默认分支的祖先，下一次发布 PR 会因历史分叉冲突。

没有集成分支的项目不适用本步：版本内容走普通 PR 合入默认分支，发布即打 tag。

**tag 触发的项目**：合并后直接推送，进入 E17。

**push 默认分支即部署的项目**：暂不推送，等 E17 批准后再推。

### E17｜发布前须征得 owner 同意〔final〕

发布不可逆，每次执行前都须 owner 明确同意。此前的批准不适用于本次。

### E18｜有告警不得发版（发布硬门禁）〔interface〕

只要存在任一未处理告警（Dependabot / CodeQL / secret scanning），一律不得发版。不得以「告警不在本次改动里」「在测试代码里」「不进发布产物」「与本版无关」为由豁免。

该门禁须由发布工作流 fail-closed 执行（查询告警数，非 0 即中止发布），不得只靠人工核对。告警修复后须等下一轮扫描确认关闭，才算清零。依赖类告警按 E22 处理。

门禁凭据一律用环境级只读 secret（至少能读 Dependabot / Code scanning / Secret scanning 告警）；`GITHUB_TOKEN` 读不到 secret scanning 告警，不得用它当门禁凭据。查询本身失败同样中止发布。

### E19｜打 tag 并推送〔interface〕

一律用 annotated tag 并附说明。push 默认分支即部署、不使用版本号的站点不适用本条。

tag 提交须在默认分支上；发布工作流须对此做 fail-closed 校验（不在默认分支即中止），不靠人工核对。

单次推送不超过 3 个 tag，超过时 GitHub 不生成 push 事件。多包仓库逐个推送，推送后确认 workflow 真的启动。

### E20｜发布凭据〔final〕

发布凭据一律放环境级 secret，仓库级不保留；environment / secret 设置按 [repo-settings.md](repo-settings.md) 的 GitHub 控制映射。

### E21｜发布后收尾〔final〕

已发布的版本与 tag 不得覆盖、不得移动。出错只能发新版本修正，且须重新执行 E17 的确认。

发布完成后切回 `dev` 继续开发。单分支项目不适用。

### E22｜依赖维护〔final〕

依赖升级一律手动执行，自动升级按 F3 保持关闭。

运行时依赖或产物依赖单独发补丁版，不与其他改动合并；纯 devDependencies 可并入下个版本。依赖不进产物时 CHANGELOG 写明「无用户可感知的变化」。

### E23｜坏版本处理〔final〕

坏版本一律用 deprecate，不得 unpublish，由 owner 在本机手动执行。无 deprecate 能力的市场只在 README 与 Release 说明里标注已知问题，指向修复版本。

退役包另有处置：发布后 24 小时内的 unpublish 窗口内可从 npm 移除；超出窗口的用 deprecate，并在 README 如实描述（不得笼统声称「npm 包已删除」）。以上 npm 处置均由 owner 执行。

### E24｜CI 环节名称〔overridable〕

以下名称是规定，不得自创：

| 环节 | 职责 |
|---|---|
| `typecheck` | 类型检查 |
| `test` | 单元测试 |
| `build` | 构建可运行产物 |
| `package` | 打成发布形态 |
| `publish` | 发布到市场或 registry（不可逆，须 owner 当次确认） |
| `deploy` | 部署上线（对外可见，须 owner 当次确认） |
| `sync` | 数据同步 |

每个项目只放真实存在的环节，同型项目顺序保持一致。required checks 按 [repo-settings.md](repo-settings.md) 的 GitHub 控制映射对齐。
