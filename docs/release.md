# 发布流程

> 低频操作；固定门禁在 CI 与 GitHub 规则集中执行。日常开发不要读本文件，只有准备发版时使用。

## 前置条件

- `main` 工作区干净，`pnpm run verify` 全绿。
- 两份 CHANGELOG 已加入本次版本条目，`package.json` 版本号已更新，并随普通 PR 合入 `main`。
- README 有用户可感知变化时已同步。
- `main` 只能通过 PR 合并（squash）；required checks 为 `typecheck`、`test`、`build`、`package`。
- `meta/SOURCE.md` 记录的 meta 版本就是本次使用的版本。

## 发版步骤

1. 确认 `main` 的 CI 全绿，`git diff --check` 干净。
2. 版本号与两份 CHANGELOG 通过普通 PR 合入 `main`（squash），等待四个 required checks 通过；不得直接 push `main`。
3. 发布前确认：打 tag / 发布市场前，向 owner 明确报出「要发什么、版本号、目标通道、影响范围」，获得当次确认；上一次批准不适用于本次。
4. 在 `main` 上创建 annotated tag 并推送。`v*` tag 受保护，只有 owner 能创建/移动/删除；Agent 不得推送 tag：

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z: <简述>"
   git push origin vX.Y.Z
   ```

   单次推送不超过 3 个 tag；超过 3 个时 GitHub 不生成 push 事件。

5. `publish.yml` 依次执行：

   - 校验 tag 提交在 `main` 上（不在则中止）；
   - 发布安全门禁：Dependabot / CodeQL / secret scanning 任一未处理、查询失败或凭据缺失即中止；
   - 打包 VSIX → 发布 VS Code Marketplace → 创建 GitHub Release（说明由两份 CHANGELOG 当版条目拼接）。

6. 发布完成后确认 Marketplace 与 GitHub Release，继续在 `main` 上开发。

## 发布前检查

- 有用户可见改动时，按本地 `meta/playbooks/acceptance.md` 完成验收并留下证据（截图 / DOM / 控制台 / 网络 / CLI 输出），记录环境、版本与操作步骤；只有 `verify`、没有页面证据不算验收，不发布。没有用户可见改动时写「无用户可见改动」。
- 按本地 `meta/rules/verification.md` 的 QG / L 与 G 段逐项确认，并跑一次 `pnpm run verify`。
- 依赖升级按 E22：运行时/产物依赖单独发补丁版；纯 devDependencies 可并入本版。

## 凭据

- `VSCE_PAT`、`SECURITY_ALERTS_TOKEN` 只放在 `marketplace-publish` 环境级 secret。
- 仓库级 secret 不保留。
- token 不写入仓库、日志、README 或聊天消息。

## 红线

- 已发布版本与 tag 不覆盖、不移动；出错只能发新版本修正，并重新取得 owner 当次确认。
- 已发布版本不能用 unpublish 撤回；npm 相关处置按 E23，由 owner 手动执行。
- 依赖升级一律手动；Dependabot 自动升级与 security updates 保持关闭。
