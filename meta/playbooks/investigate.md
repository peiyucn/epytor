# Investigate

> 何时用：只查不改的问题——“怎么工作的”“为什么这样”“确定吗”“有没有风险”。
> 何时不用：需要修 bug / 加功能 / 改结构。

> 依赖：[rules/verification.md](../rules/verification.md)、[principles/prove-it-works.md](../principles/prove-it-works.md)

## 步骤

1. **把问题写成一句可回答的话**
   - 是事实问题、原因问题，还是风险评估？
   - 明确范围：哪个模块/版本/环境。
   - 调用：AGENTS C3（结论须有依据）。

2. **找证据**
   - 读源码、文档、测试、提交历史、issue/PR；
   - 需要时运行只读命令（读文件、查日志、跑现有测试）；
   - 引用文件路径和行号，不凭记忆。
   - 调用：[principles/prove-it-works.md](../principles/prove-it-works.md)；AGENTS C3、C4；涉及 GUI 时调 [skills/browser/SKILL.md](../skills/browser/SKILL.md)。
   - 证据：文件路径 + 行号、命令输出。

3. **区分事实与推断**
   - 事实：来自代码/命令输出；
   - 推断：标明“推断”，并写依据；
   - 查不到：写“未查到”。
   - 调用：AGENTS C2、C3。

4. **回答**
   - 先给结论；
   - 再给证据链；
   - 再给不确定项和下一步。
   - 证据：结论、证据链、未查到项。

5. **不修改**
   - 调查阶段不开 PR、不改代码；
   - 如果发现问题需要修，先报告，等 owner 决定。
   - 调用：AGENTS C8（不可逆操作先问 owner；改代码前先转任务）。

## 输出

```text
结论：
证据：
推断/不确定：
未查到：
建议下一步：
```

## 停止 / 询问

- 需要改代码才能回答 → 先问 owner 是否切换任务；
- 需要访问没有权限的系统 → 说明限制，不猜；
- 两种解释都成立 → 列出区分它们所需的最小验证。
