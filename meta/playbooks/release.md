# Release

> 何时用：准备发布版本、打 tag、发市场/registry/Pages。
> 何时不用：还在开发/验证阶段；发布是不可逆动作，不确定就停。

> 依赖：[rules/engineering.md](../rules/engineering.md)（E 段）、[rules/repo-settings.md](../rules/repo-settings.md)（F 段）、[rules/verification.md](../rules/verification.md)、[skills/review/SKILL.md](../skills/review/SKILL.md)、[playbooks/acceptance.md](acceptance.md)

## 发版前预检

- 重新读本文件，不要复用会话开始时读到的旧版本；
- 确认项目 `meta/SOURCE.md` 的提交就是本次要用的版本；
- 发版过程中同步过 meta，必须重新读本文件再继续；
- 把 meta 版本写进发布记录。

## 步骤

1. **发布前验证**
   - 项目 `verify` 全绿；
   - 工作区无未提交改动。
   - 调用：[rules/engineering.md](../rules/engineering.md) E8；[rules/verification.md](../rules/verification.md) G8。

2. **用户可见验收**
   - 有用户可见改动：按 [playbooks/acceptance.md](acceptance.md) 执行；
   - 证据至少一种：截图 / DOM / 控制台 / 网络 / CLI 输出；
   - owner 已实测：记录环境、版本、操作步骤、结果；
   - 只有 `verify`、没有页面证据，不算验收；
   - 没有用户可见改动：写“无用户可见改动”；
   - 有用户可见改动但没有证据：停止，不发布。
   - 调用：[playbooks/acceptance.md](acceptance.md)；[rules/verification.md](../rules/verification.md) G8。

3. **准备内容**
   - 按本文件“文档写法”准备中英 CHANGELOG 新版本条目；
   - 版本号文件；
   - README 有行为变化则同步；
   - 依赖不进产物时写明“无用户可感知的变化”。
   - 调用：本文件“文档写法”；[rules/engineering.md](../rules/engineering.md) E15。

4. **安全门禁**
   - 查询未处理告警：Dependabot / CodeQL / secret scanning；
   - 任一非零 → 停止；
   - CodeQL 必须扫过本轮默认分支提交，不用上一轮代替；
   - 查询失败也停止，不能 fail-open。
   - 调用：[rules/repo-settings.md](../rules/repo-settings.md) 的 F 与 GitHub 控制映射。

5. **owner 当次确认**
   - 发布不可逆，每次都要 owner 明确同意；
   - 之前的批准不适用于本次；
   - 确认发布通道、版本、tag。
   - 调用：AGENTS `## 1` 的 C8；发布门禁在本 playbook 的步骤 1–6。

6. **合并发布 PR 并打 tag**
   - 有集成分支的项目：发布 PR 用 **merge commit** 合并，不用 squash；合并后确认 `git merge-base --is-ancestor origin/<集成分支> origin/<默认分支>` 为真（否则下一次发布 PR 会冲突）；没有集成分支的项目跳过本条（没有发布 PR）；
   - tag 从默认分支提交打，annotated tag；
   - 单次推送不超过 3 个 tag；
   - 发布 workflow 挂 environment；凭据用环境级 secret；
   - 确认 workflow 真的启动。
   - 调用：[rules/repo-settings.md](../rules/repo-settings.md) 的 tag / environment 设置；[rules/engineering.md](../rules/engineering.md) E19、E20；[skills/github/SKILL.md](../skills/github/SKILL.md)。

7. **发布后**
   - 已发布版本/tag 不覆盖、不移动；
   - 坏版本用 deprecate 或新版本修正，不 unpublish（npm 24h 窗口例外）；
   - 切回开发分支；
   - 记录发布结果和告警状态。
   - 调用：[rules/engineering.md](../rules/engineering.md) E21。

## 文档写法

README 与 CHANGELOG 中英双份，英文为默认，顶部互链。只针对项目实际存在的文档；不存在的文档不适用。

- README：面向用户，写安装、使用、配置；有已知限制或安全隐患时一并写明。
- CHANGELOG：每条一项可感知变化，遵循 Keep a Changelog；标题 `## [x.y.z] - YYYY-MM-DD`，从新到旧，日期取发版当日；依赖不进入产物时写“无用户可感知的变化”。

## 硬门禁

- `verify` 失败：不发布；
- 有用户可见改动但没有验收证据：不发布；
- `meta/SOURCE` 与本次要用的版本不一致：不发布；
- 告警非零/查询失败：不发布；
- 没有 owner 当次确认：不发布；
- 发布 PR 用 squash 合并、集成分支没有成为默认分支祖先：不发布；
- tag 不在默认分支：不发布；
- 发布凭据不是环境级 secret：不发布。

## 输出

```text
版本：
tag：
发布通道：
meta 版本：
verify：
验收证据：
告警：
owner 确认：
发布结果：
回滚/后续：
```

## 停止 / 询问

- 任何不可逆步骤前；
- 有用户可见改动但没有验收证据；
- `meta/SOURCE` 与本次要用的版本不一致；
- 告警无法清零；
- 发布 workflow 失败且原因不明；
- 版本内容与 CHANGELOG 不一致。
