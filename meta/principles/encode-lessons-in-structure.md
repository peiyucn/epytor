# Encode Lessons in Structure

> 何时应用：发现自己在写同一句提醒；同一个错误第二次出现；owner 再次纠正同一类问题。

## 判断

先问：这条教训能不能变成**不会犯的结构**？

顺序：

1. 架构/API：让错误写法不可用，或没有入口；
2. 类型：让非法状态写不出来；
3. lint/CI：让错误代码过不去，错误信息指出正确写法；
4. 测试：让行为回归变红；
5. 文档/AGENTS：只留给真正需要判断、无法自动化的内容。

如果只能靠判断：把说明放在更显眼的位置，并补一个失败示例，而不是只加一句“要注意”。

## 反例

- 同一个 bug 修了三次，AGENTS 加了三条“要小心”；
- 加一条 lint，但错误信息只说“禁止使用”，不说该用什么；
- 用注释解释 workaround，让下一个 agent 以为这是正确模式。

## 关联

- 规则：[AGENTS.md](../../AGENTS.md) C10
- 技能：[skills/correct/SKILL.md](../skills/correct/SKILL.md)
- 原则：[fix-root-causes.md](fix-root-causes.md)
