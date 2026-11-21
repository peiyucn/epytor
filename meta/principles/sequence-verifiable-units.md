# Sequence Verifiable Units

> 何时应用：多步改动、迁移、连续多个提交/PR、长任务。

## 判断

把工作切成**每个都能独立验证的小单元**：

- 每个单元结束时，有一个明确的检查/证据；
- 前一个单元没验证，不开始下一个；
- 提交顺序本身要能证明变化：失败复现在前，修复在后；结构变更在前，功能在后；
- 长任务在阶段边界重新切分，不把未验证的工作越堆越大。

一个单元可以很小：一条测试、一个调用方迁移、一个失败状态变绿。

## 反例

- 一次改十几个文件，最后才跑一次测试；
- 重构和功能混在同一个提交；
- 先堆五个未验证的 PR，再一起修；
- 失败复现放在修复后面，历史看不出问题。

## 关联

- 规则：[rules/engineering.md](../rules/engineering.md) E10
- 步骤：[playbooks/feature.md](../playbooks/feature.md)、[playbooks/refactoring.md](../playbooks/refactoring.md)
