# 规则索引

> 规则层入口。这里只做文件索引和规则级别；具体规则和执行方式在 engineering / repo-settings / verification。
>
> 引用规则用“文件 + 章节标题”；不新增规则编号；规范必须有执行方式。

## 1. 文件

| 文件 | 范围 |
|---|---|
| [engineering.md](engineering.md) | E 工程管线 |
| [repo-settings.md](repo-settings.md) | F 仓库设置、GitHub 控制映射 |
| [verification.md](verification.md) | QG 质量门禁、L 代码检查、G 代码审计 |

共享 lint 实现：[lint/eslint-base.mjs](../lint/eslint-base.mjs)、[lint/check-comments.mjs](../lint/check-comments.mjs)。

## 2. 规则级别

规则标题末尾的〔…〕是约束级别：

| 级别 | 含义 | 项目能否改变 |
|---|---|---|
| `constructor` | 接入时的一次性动作 | 不能 |
| `final` | 固定要求，只能加严 | 不能 |
| `overridable` | 规则给出默认值，项目按实际情况取值 | 只能在规则允许的范围内取值 |
| `interface` | 规则要求一个实现 | 必须实现，不能改变要求 |

级别标在具体规则标题或检查登记的 `级别` 列上；`## G 代码审计` 这类分组标题不带级别。

规则级别固定为四种，不新增。

QG/L 是检查登记 ID，不属于 E/F 规则编号；级别写在表内 `级别` 列。
