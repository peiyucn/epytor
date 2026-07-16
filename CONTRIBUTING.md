# Contributing

Contributions are welcome! Here's how to get started.

> **Note:** Coding conventions, architecture constraints, and testing standards are maintained in [AGENTS.md](./AGENTS.md). This file covers setup and contribution workflow only — see AGENTS.md for the full specification.

## Development Setup

```bash
# Prerequisites: Node.js 18+, pnpm 10+
pnpm install
pnpm build
```

Press **F5** in VS Code to launch a debug instance with the extension loaded.

## Build

Two-target build via `esbuild.mjs`:

| Target | Output | Runtime |
|--------|--------|---------|
| Extension | `dist/extension.js` | Node.js (`tsconfig.json`) |
| WebView | `dist/webview.js` + `dist/webview.css` | Browser (`tsconfig.webview.json`) |

```bash
pnpm build         # Development build
pnpm watch         # Watch mode
pnpm run package   # Package into releases/*.vsix
```

## Conventions

Coding and testing standards are defined in [AGENTS.md](./AGENTS.md):

- [Development rules](./AGENTS.md#开发) — package manager, TypeScript, commit format, architecture constraints, key files
- [Testing standards](./AGENTS.md#测试) — framework, coverage thresholds, workflow, mock conventions

Quick reference:

- **Package manager**: `pnpm` only — no npm or yarn
- **Communication**: WebView ↔ Extension only through `webview/messaging.ts`
- **CSS**: Must use `--vscode-*` variables for light/dark theme support
- **Git commits**: English type prefix + Chinese description (e.g. `feat: 新增功能`)
- **Testing**: `pnpm test` must pass before pushing (CI runs on every push/PR to `main`/`dev` — see `.github/workflows/ci.yml`)

## Submitting Changes

1. Create a branch from `dev`: `git checkout -b feature/your-feature`
2. Make changes, write tests, run `pnpm test` + `pnpm build`
3. Open a Pull Request against the **`dev`** branch

> **Note:** `dev` is the active development branch. `main` is the stable release branch — do not target PRs there.

## Reporting Bugs

Please open a [GitHub Issue](https://github.com/peiyucn/epytor/issues/new) with your VS Code version and relevant logs from the Output panel (`EPYTOR` channel).
