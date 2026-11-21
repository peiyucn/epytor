# Boundary Discipline

> 何时应用：接线验证、错误处理、外部 API/CLI/配置/网络数据。

## 判断

把校验集中在**系统边界**：

- CLI 参数、配置文件、网络响应、用户输入：在入口解析/校验一次；
- 内部函数信任已经解析过的类型，不重复判空；
- 业务逻辑保持纯函数，不直接读环境/网络/UI；
- 边界失败要给出用户可见反馈，而不是只写日志。

边界之外不信任数据；边界之内不重复防御。

## 反例

- 每个内部函数都重新检查同一个字段；
- 在 UI 层解析网络响应，领域层拿到半成品；
- 外部请求没有超时/白名单；
- 失败只打日志，用户看不到状态。

## 关联

- 规则：[rules/verification.md](../rules/verification.md) G3/G4
- 原则：[model-the-domain.md](model-the-domain.md)
- 审查：[skills/review/SKILL.md](../skills/review/SKILL.md)
