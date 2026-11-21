# Fix

> 何时用：有明确缺陷，需要复现、找根因、修好并证明。
> 何时不用：行为本来就要变 → feature；只改结构 → refactoring。

> 依赖：[principles/prove-it-works.md](../principles/prove-it-works.md)、[principles/fix-root-causes.md](../principles/fix-root-causes.md)、[principles/sequence-verifiable-units.md](../principles/sequence-verifiable-units.md)、[skills/review/SKILL.md](../skills/review/SKILL.md)、[rules/verification.md](../rules/verification.md)

## 步骤

1. **复现**
   - 在真实界面/命令上复现，不先让 owner 复现；
   - 记录操作、输入、实际输出；
   - 完成条件：能稳定触发同一个错误。
   - 调用：[principles/prove-it-works.md](../principles/prove-it-works.md)。
   - 证据：复现步骤、实际输出。

2. **找根因**
   - 列出候选假设，用运行时证据逐个排除；
   - 找到第一个出错的地方，不是错误最终暴露的地方；
   - 完成条件：能用证据解释“为什么这里会错”。
   - 调用：[principles/fix-root-causes.md](../principles/fix-root-causes.md)。
   - 证据：根因位置、运行时证据。

3. **定义最小修复**
   - 一次只修一个根因；
   - 不顺手重构、不加“可能有用”的防御；
   - 如果修复需要改架构/类型，先说明范围。
   - 调用：[principles/laziness-protocol.md](../principles/laziness-protocol.md)。
   - 证据：修复范围、不做什么。

4. **先留失败证据**
   - 能写测试就写失败测试；
   - 不能写测试就留可重跑的最小复现命令；
   - 完成条件：修复前失败。
   - 调用：[principles/test-behavior-not-implementation.md](../principles/test-behavior-not-implementation.md)。
   - 证据：失败测试/最小复现输出。

5. **修复**
   - 保持改动最小；
   - 删除调试脚手架；
   - 同类错误第二次出现 → 按 [skills/correct/SKILL.md](../skills/correct/SKILL.md) 升级检查。
   - 调用：[principles/laziness-protocol.md](../principles/laziness-protocol.md)。
   - 证据：最小 diff、无调试残留。

6. **在同一表面验证**
   - 原始复现现在通过；
   - 相关错误/边界路径也测；
   - 不把“单测通过”当作 bug 消失。
   - 调用：[principles/prove-it-works.md](../principles/prove-it-works.md)；[rules/verification.md](../rules/verification.md) G8、L；涉及 UI 时调 [skills/browser/SKILL.md](../skills/browser/SKILL.md)。
   - 证据：复现前后输出、失败→通过。

7. **审查 + PR**
   - 走 [skills/review/SKILL.md](../skills/review/SKILL.md)；
   - PR 说明：broken / root cause / fix / verification；
   - 贴失败到通过的输出。
   - 调用：[rules/engineering.md](../rules/engineering.md) E8、E10；[skills/github/SKILL.md](../skills/github/SKILL.md)；合并前 required checks + owner 批准。
   - 证据：review verdict、PR 说明。

## 输出

```text
问题：
根因：
修复：
验证：
未验证/风险：
```

## 停止 / 询问

- 认证/支付/权限/用户数据；
- 不可逆操作；
- 同一方法失败两次；
- 复现不了，且没有合理的合成触发。
