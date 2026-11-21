# Playbook Router

> 何时用：每次发起动作前。
> 何时不用：已经在执行某个 playbook 的步骤中。

## 输入

用户请求 / 当前任务。

## 匹配

| 任务 | 打开 |
|---|---|
| 只查不改 / 调查 | [investigate.md](../../playbooks/investigate.md) |
| 修 bug | [fix.md](../../playbooks/fix.md) |
| 新功能 / 行为变更 | [feature.md](../../playbooks/feature.md) |
| 只改结构、不改行为 | [refactoring.md](../../playbooks/refactoring.md) |
| 发布 | [release.md](../../playbooks/release.md) |
| 建仓库 / 接入新项目 | [repo-setup.md](../../playbooks/repo-setup.md) |
| 用户可见验收 | [acceptance.md](../../playbooks/acceptance.md) |
| 审查 diff / PR / 设计 | [../review/SKILL.md](../review/SKILL.md) |
| owner 纠正了同类问题第二次 | [../correct/SKILL.md](../correct/SKILL.md) |

## 不匹配

停下，问 owner 是否补充 playbook；不要硬套。

## 输出

playbook 路径 + 匹配理由 + 不确定项。
