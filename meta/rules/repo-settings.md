# 仓库设置

> GitHub 仓库的初始设置；接入时配置，发布时检查。非 GitHub 托管仓库不适用。

## F 仓库设置

### F1｜公开仓库全部开启〔final〕

Dependabot alerts（仅报警）、CodeQL default setup、secret scanning 与 push protection、private vulnerability reporting、根目录 `SECURITY.md`。

### F2｜私有仓库仅开启 Dependabot alerts〔final〕

免费计划下其余开关、分支保护与 ruleset 均不可用，记「不可用」不算违规。

### F3｜统一保持关闭〔final〕

secret scanning 的非提供商模式、validity checks、Dependabot 自动升级。

### F4｜逐项核验〔final〕

配置完成与每次变更后逐项核验，结果记录在案；套用项目契约的项目记入其 AGENTS 的 `## 3. 实现` 段。

核验项：安全开关各项状态、未处理告警数、CodeQL 状态、私有漏洞报告、`SECURITY.md`、ruleset 清单与规则、合并设置、默认分支的经典保护。私有仓库的分支保护相关项按 F2 记「不可用」。

### F5｜分支保护三层〔final〕

三层指：经典分支保护、ruleset 轻量保护、仓库合并设置。

- **经典保护**：只在此层设「要求对话解决」与「不允许绕过」。不设 required status checks，因会挡住 owner 直推。
- **ruleset**：固定为禁删除、禁强推、禁重建，绕过名单留空。公开仓库的默认分支与 `dev`（如有）各一条。
- **合并设置**：开 squash 与 merge commit，关闭 rebase。该项不在 ruleset 也不在安全开关里，最易漏查。
- **发布 PR 的合并方式**：集成分支 → 默认分支的发布 PR 必须用 merge commit，不用 squash。squash 不会让集成分支成为默认分支的祖先，下一次发布 PR 必因历史分叉冲突。
- **没有集成分支的项目**：发布就是给默认分支打 tag，没有「发布 PR」，仓库合并方式保持**仅 squash**。
- **代码归属**：AGENTS、规则、检查脚本、CI 由 `.github/CODEOWNERS` 覆盖；PR 须 owner 审阅，Agent 不自合并。

### F6｜直推权限与外部交互〔final〕

owner 保留 fast-forward 直推能力。公开仓库的外部 PR 与 Issue 一律开放，不设交互限制；不接受的直接关闭。

单仓库可按其 AGENTS 登记例外。

## GitHub 控制映射

| 控制 | GitHub 配置 | 关联规则 |
|---|---|---|
| 分支更新 | ruleset：禁止直推、强推、删除 | F5、E7 |
| 合并方式 | 有集成分支：squash + merge commit（发布 PR 用 merge commit）；无集成分支：仅 squash | F5 |
| required checks | ruleset 的 required status checks | E24、F5 |
| 代码归属 | `.github/CODEOWNERS` | C10、F5 |
| 发布 tag | tag ruleset：`v*` | E19 |
| 发布环境 | environment + 环境级 secret | E4、E20 |

名单见 meta-repo 的 `README.md` 的 `## 项目清单`（唯一登记处，`GitHub 策略` 列决定是否纳入）；机器可读期望值见 `meta/github-policy.json`（只写期望值，不重复仓库名与可见性）；校验：`node meta/scripts/check-github-policy.mjs`。
