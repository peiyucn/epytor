# Refactoring

> 何时用：只改结构，**行为不能变**。
> 何时不用：要加/改行为 → feature；修缺陷 → fix。

> 依赖：[principles/model-the-domain.md](../principles/model-the-domain.md)、[principles/laziness-protocol.md](../principles/laziness-protocol.md)、[principles/sequence-verifiable-units.md](../principles/sequence-verifiable-units.md)、[principles/prove-it-works.md](../principles/prove-it-works.md)、[skills/review/SKILL.md](../skills/review/SKILL.md)

## 步骤

1. **先钉住行为契约**
   - 读受影响子系统，理解当前行为；
   - 写 characterization test / snapshot / equivalence harness；
   - 没有测试覆盖时，先补 pin，再动结构；
   - 完成条件：pin 在当前代码上绿。
   - 调用：[principles/prove-it-works.md](../principles/prove-it-works.md)、[principles/test-behavior-not-implementation.md](../principles/test-behavior-not-implementation.md)。
   - 证据：pin 在当前代码上通过。

2. **命名缺失的结构**
   - 用领域模型说明目标形状；
   - 如果现有形状已经清楚且局部，不动；
   - 重塑要删除分支/非法状态，不是增加间接层。
   - 调用：[principles/model-the-domain.md](../principles/model-the-domain.md)。

3. **定目标形状**
   - 模块布局、类型、调用图；
   - 跨函数边界先定接口；
   - 写下“改完后哪些东西应该更少”。
   - 调用：[principles/laziness-protocol.md](../principles/laziness-protocol.md)、[principles/boundary-discipline.md](../principles/boundary-discipline.md)。
   - 证据：目标形状、减少项。

4. **先减后加**
   - 删死代码、单调用 wrapper、重复校验、孤儿引用；
   - 最小改动达到目标形状；
   - 不做“可能有用”的清理。
   - 调用：[principles/laziness-protocol.md](../principles/laziness-protocol.md)。
   - 证据：删除项、最小 diff。

5. **小步移动**
   - 每一步都保持 pin 绿；
   - 迁移所有调用方，同一波删除旧 API；
   - 不留兼容 shim、不留新旧并行路径；
   - 重命名要回查字符串、文档、引用。
   - 调用：[principles/sequence-verifiable-units.md](../principles/sequence-verifiable-units.md)。
   - 证据：每一步 pin 通过、旧路径已删。

6. **证明行为不变**
   - 在真实产物上验证，不只看编译；
   - 必要时做 old-vs-new 等价检查；
   - 记录 reader-load 变化（层数、隐藏状态、重复逻辑）。
   - 调用：[principles/prove-it-works.md](../principles/prove-it-works.md)；[rules/verification.md](../rules/verification.md) G8。
   - 证据：等价检查、reader-load 变化。

7. **审查 + PR**
   - 走 [skills/review/SKILL.md](../skills/review/SKILL.md)；
   - 提交顺序：删除 → 重塑 → 清理；
   - PR 说明：结构变化、pin、等价证明、reader-load 变化。
   - 调用：[rules/engineering.md](../rules/engineering.md) E8、E10；[skills/github/SKILL.md](../skills/github/SKILL.md)；合并前 required checks + owner 批准。
   - 证据：review verdict、PR 说明。

## 边界

- 重构中发现新功能/真 bug：**拆出去**，先完成结构变更；
- 需要重设计：命名它，转 [feature.md](feature.md)；
- 大范围结构工作：拆成多个可验证 PR，不一次推平。

## 输出

```text
改了什么结构：
用什么钉住行为：
等价证明：
reader-load 变化：
拆出去的事项：
未验证/风险：
```

## 停止 / 询问

- pin 无法建立；
- 行为变化无法避免；
- 同一方法失败两次；
- 改动范围扩大到多个子系统。
