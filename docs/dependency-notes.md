# 依赖固定说明

`pnpm-workspace.yaml` 的 overrides 是行为的一部分。按 L006，配置文件不写注释，理由集中记录在这里。

## 单副本

- `@codemirror/state` 固定到 `^6.7.1`：`@milkdown/components` 原本解析到 6.7.1，而 `@codemirror/view` 与项目自身用 6.6.0，跨副本的 `Compartment` / `StateEffect` 不被识别，Crepe 的 `languageConf.reconfigure` 会静默失效。
- `katex` 固定到 `^0.19.0`：0.18.11 把破坏性变更发成补丁版，官方要求使用 0.19.0；Crepe 7.22.3 也声明 `^0.19.0`。mermaid 11.16.1 声明 `^0.16.45`，不 override 会出现两份 katex，样式与类名错配。
- `@types/katex` 刻意不 override：katex 自 0.16 起自带类型，DefinitelyTyped 停在 0.16.8；顶层的 `@types/katex` 不可解析，只嵌在 `micromark-extension-math` 目录里服务它自己。两个 tsconfig 都开 `skipLibCheck`，强行补一个不存在的 0.19 版类型只会掩盖问题。

## ProseMirror

- `prosemirror-model` `^1.25.12`：prosemirror-view 1.42.3 的 GHSA-c8x8-7fp4-3x9w 修复依赖 model 的属性校验；低于 1.25.12 时修复等于空转。
- `prosemirror-view` `^1.42.6`：1.42.3 起修复粘贴处理 XSS（GHSA-c8x8-7fp4-3x9w）。
- 其余 ProseMirror 包统一到兼容的补丁版，避免重复副本。

## 安全补丁（不进产物）

以下依赖只在 dev 链，升级用于清零默认分支的 Dependabot 警报，不进入 `dist`：

- `fast-uri` `^3.1.9`：GHSA-hrr3-gc8f-f4qj。
- `nanoid@3` `^3.3.18`：只钉 3.x 线；Milkdown 自己使用 6.x，不能合并。
- `js-yaml` `^4.3.2`：GHSA-2883-xcg3-v3hh（vsce → secretlint 链）。
- `dompurify` `^3.4.17`：GHSA-6688-9rhm-gjv2 / GHSA-p98j-92pf-mc4p。
- `source-map-js` `^1.2.2`：GHSA-68fv-2mgg-jv7q。
- `brace-expansion` `^5.0.12`：GHSA-q2hr-2g5m-vwhr。
- `markdown-it` `^14.3.3`：GHSA-253c-mchw-3w2r（14.x 线内升级）。
- `undici@7` `^7.29.1`、`undici@8` `^8.12.3`：分别修复 7.x / 8.x 线的 undici 警报；vsce → cheerio 声明 `^7.19.0`，不能强行合并成 `^8`。
- `qs` `^6.16.1`：GHSA-4mjr-xmp4-gh2g / GHSA-x5fp-wj9c-mxmx。
- `@azure/identity` `^4.14.1`：Dependabot #108；vsce 声明 `^4.1.0`，4.14.1 在范围内。
- `minimatch` `^11.0.1`：GHSA-g3hv-75wg-m249；vsce 声明 `^10.2.6`，11 仍导出同名函数。

升级这些依赖时对照本文件与 `docs/upstream-limits.md` 逐项验证；已解决的安全条目从 overrides 与本文中移除，并写入 CHANGELOG 的修复项。
