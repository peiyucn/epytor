# Review

> 触发：审查 diff / PR / 设计；完成实现后、合并前；owner 说“看看这个”。
> 不触发：只查代码怎么工作 → `playbooks/investigate.md`；用户可见验收 → `playbooks/acceptance.md`。

## 输入 / 权限

- 输入：diff / PR / 设计、spec / 验收标准、`verify` 输出；
- 权限：只读；不改代码、不合并。

## 目标

不是证明“看起来没问题”，而是找出**有证据的问题**，并给出明确 verdict。

## 步骤

### 1. 读意图

- spec / issue / PR 描述 / 验收标准；
- 这次改动的目标、非目标、假设；
- 如果意图本身不清楚，先指出，不替它猜。

### 2. 看 diff

- 逐文件读实际 diff，不看摘要；
- 确认改动范围和声明一致；
- 找“没改但应该改”的地方（调用方、文档、测试、迁移）。

### 3. 跑

- `verify` / 测试；
- UI 改动跑真实界面；
- CLI 跑真实命令；
- 必要时看控制台、网络、日志。

### 4. 查

- 行为回归、边界条件、错误路径；
- 权限、凭据、外部输入；
- 死代码、调试脚手架、被注释掉的旧路径；
- 永远通过的测试、只测实现的测试；
- 文档/CHANGELOG 是否漏。

### 5. 给 finding

每条 finding 必须有：

```text
位置：
问题：
证据（命令/输出/代码路径）：
影响：
建议：
级别：blocker / non-blocker
```

没有证据的猜测标为“假设”，不能当 blocker。

### 6. Verdict

```text
通过 / 有条件通过 / 打回
未验证项：
剩余风险：
```

## 检查

- 每条 finding 有位置、证据、影响；
- blocker 能被证据复跑；
- 未验证项和剩余风险写明。

## 边界

- 不为了显得严格而编造问题；
- 不因为“整体看起来还行”放过 blocker；
- review 不替代 acceptance；两者可以串联；
- 合并由 owner；required checks 全绿；Agent 不自合并。

## 关联

- 原则：[prove-it-works.md](../../principles/prove-it-works.md)、[fix-root-causes.md](../../principles/fix-root-causes.md)
- 规则：[verification.md](../../rules/verification.md)
- 验收：[acceptance.md](../../playbooks/acceptance.md)
