# GitHub

> 何时用：GitHub 仓库操作、PR、issue、ruleset 查询。
> 何时不用：本地 git 操作。

## 身份

- agent 的 GitHub API / PR 操作用 `gh-agent`；push 用 `git-agent`；
- `gh` 是 owner / Forge 身份；agent 不用 `gh` 做写操作；
- owner 动作（建仓库、environment、secret、tag、bypass）由 owner 执行；agent 不代做；
- GitLab 仓库用 `git` 或 `glab`；
- GitHub 连接失败、超时或 push 中断时，先读 [proxy skill](../proxy/SKILL.md)；不要无代理连续重试。

## 检查

- `gh-agent api user` 返回 agent 账号，不是 owner；
- PR 的作者和最后推送者都是 agent；
- 命令输出或 URL。
