# Model the Domain

> 何时应用：写状态逻辑；发现同样的条件分支散落在多个文件；设计类型/接口时。

## 判断

先定**数据形状**，再写逻辑：

- 核心状态是什么？谁拥有它？
- 用状态机/枚举/联合类型/表/注册表表达，而不是一堆布尔和 if；
- 让非法状态不可表达；
- 命名领域概念，而不是按界面位置命名。

数据形状对了，下游代码会变短；形状错了，后面会不断打补丁。

## 反例

- `isLoading`、`isError`、`hasData` 三个布尔组合出非法状态；
- 用 `type` 字符串 + `switch` 散落在多个文件；
- 在 UI 层拼业务状态，领域层没有模型；
- 同一份 shape 假设在多个文件重复。

## 关联

- 原则：[boundary-discipline.md](boundary-discipline.md)
- 步骤：[playbooks/feature.md](../playbooks/feature.md)、[playbooks/refactoring.md](../playbooks/refactoring.md)
