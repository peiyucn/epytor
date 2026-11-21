# Prove It Works

> 何时应用：声明“完成”之前；准备给 owner 证据时。

## 判断

验证要落在**真实产物**上，不是代理指标：

- 功能：实际运行应用/命令，操作到用户能看到的状态；
- UI：截图/DOM/控制台/网络，不只看构建成功；
- CLI：真实命令、真实输出、退出码；
- 后端：集成路径，不只是单元测试；
- 重构：旧行为在新结构下不变的证据。

“类型检查通过”“测试绿了”“应该可以”都不是完成证据。

## 反例

- 单测全绿，但应用启动不了；
- 截图只截了成功态，没测错误/空/加载态；
- 用 mock 证明行为，没有跑真实路径；
- 报告里写“已验证”，但没有命令、输出或路径。

## 关联

- 规则：[rules/verification.md](../rules/verification.md)
- 步骤：[playbooks/acceptance.md](../playbooks/acceptance.md)
- 审查：[skills/review/SKILL.md](../skills/review/SKILL.md)
