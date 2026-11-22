# Repo Setup

> 何时用：新建仓库，或把已有仓库接入 meta 体系。
> 何时不用：仓库已配置好，只做日常开发。

## 步骤

1. **建仓库**
   - 做：owner 用 `gh` 建公开或私有仓库；agent 不代建。
   - 调用：[rules/engineering.md](../rules/engineering.md) E1；[skills/github/SKILL.md](../skills/github/SKILL.md)；需要代理时调 [skills/proxy/SKILL.md](../skills/proxy/SKILL.md)。
   - 证据：仓库 URL、可见性。

2. **配置仓库设置**
   - 做：按仓库设置规则配置安全开关、分支保护、合并设置、CODEOWNERS、tag、environment。
   - 调用：[rules/repo-settings.md](../rules/repo-settings.md) 的 F1–F6 与 GitHub 控制映射；[skills/github/SKILL.md](../skills/github/SKILL.md)。
   - 证据：`node meta/scripts/check-github-policy.mjs` 输出。

3. **放工作流**
   - 做：`ci.yml` / `publish.yml`，环节名称按 E24。
   - 调用：[rules/engineering.md](../rules/engineering.md) E3、E24。
   - 证据：工作流文件。

4. **创建部署环境**
   - 做：owner 用 `gh` 按发布通道建 environment，凭据放环境级 secret；agent 不代建。
   - 调用：[rules/repo-settings.md](../rules/repo-settings.md) 的 environment 设置；[rules/engineering.md](../rules/engineering.md) E4。
   - 证据：environment 名称、凭据存放位置（不记录值）。

5. **放文档骨架**
   - 做：AGENTS、中英 README、中英 CHANGELOG。
   - 调用：[rules/engineering.md](../rules/engineering.md) E5；[rules/repo-settings.md](../rules/repo-settings.md) 的 SECURITY.md。
   - 证据：文件存在。

6. **登记**
   - 做：README 的项目清单加一行；有 CI/发布的，加管线行。
   - 做：同一行的 `GitHub 策略` 列标 `策略`（不纳入标 `—`），并在 `meta/github-policy.json` 加同名的期望值条目——只写期望值，不再写仓库名与可见性。
   - 调用：meta-repo 根 `README.md` 的 `## 项目清单`；[rules/engineering.md](../rules/engineering.md) E 工程管线第一段、E6；[rules/repo-settings.md](../rules/repo-settings.md)。
   - 证据：README 行、管线行、`check-github-policy` 输出。

7. **校验**
   - 做：跑 GitHub 配置校验和项目契约校验。
   - 调用：`node meta/scripts/check-github-policy.mjs`、`node meta/scripts/check-project-contract.mjs`。
   - 证据：命令输出。

## 输出

```text
仓库：
可见性：
仓库设置：
工作流：
environment：
文档：
登记：
校验：
未完成/风险：
```

## 停止 / 询问

- 需要降低安全基线；
- 需要 owner 凭据或 environment secret；
- 项目档位不确定。
