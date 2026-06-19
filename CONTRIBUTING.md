# Contributing

Contributions are welcome! Here's how to get started.

## Development Setup

```bash
# Prerequisites: Node.js 18+, pnpm 10+
pnpm install
pnpm build
```

Press **F5** in VS Code to launch a debug instance with the extension loaded.

## Project Structure

```
src/                          Extension host (Node.js) — VSCode API, file I/O
  extension.ts                Extension entry, registers CustomEditorProvider
  MarkdownEditorProvider.ts   Provider core (message routing, auto-save, revert)
  MarkdownDocument.ts         Document model
  utils/
    getNonce.ts               CSP nonce generation
    imageService.ts           Image save (MD5 dedup) + server upload
    contentTransform.ts       Markdown content transformation
    lineMap.ts                Source line mapping
  i18n/
    webviewTranslations.ts    WebView translation data
webview/                      WebView frontend (Browser)
  index.ts                    Entry (message routing, DOM events, branding)
  editor.ts                   CrepeBuilder entry (Milkdown 7.21.2 + Crepe features)
  messaging.ts                WebView ↔ Extension message protocol
  style.css                   VSCode theme coverage (--vscode-* CSS variables)
  headingIds.ts               Heading id management (no DOM mutation)
  i18n/                       Translation helpers t() / kbd()
  ui/                         Shared UI utilities (SVG icons, tooltip)
  utils/                      Theme bus, slug, etc.
  components/
    selectionToolbar/         Selection toolbar (floating format menu)
    toc/                      Table of Contents panel
    imageView/                Image NodeView (selection, lightbox, zoom)
    findBar/                  In-editor find bar (Ctrl/Cmd+F)
    pathLink/                 Path link autocomplete
shared/                       Shared types (Extension ↔ WebView)
__mocks__/                    VSCode API mock (injected via vitest alias)
docs/
  roadmap.md                  Project roadmap
  specs/                      Feature spec documents
  CHANGELOG.md                Release changelog
```

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

## Code Conventions

- **TypeScript everywhere**
- **Package manager**: `pnpm` only — no npm or yarn
- **WebView ↔ Extension communication** only through `webview/messaging.ts`
- **CSS** must use `--vscode-*` variables for light/dark theme compatibility
- **No DOM scraping**: prefer framework/plugin APIs over MutationObserver hackery
- **Git commit messages**:
  - Type prefix in English: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, `test:`
  - Description in **Chinese**
  - Example: `feat: 新增 TOC 工具栏按钮`
  - End with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`

## Testing

### Stack

| Layer | Framework | Scope |
|-------|-----------|-------|
| Extension unit | **Vitest 2.x** (Node) | `src/utils/`, `src/MarkdownDocument.ts` |
| WebView unit | **Vitest 2.x + jsdom 24.x** | `webview/utils/`, `webview/messaging.ts` |
| Integration (planned) | **@vscode/test-electron + Mocha** | Real VSCode Extension Host |

The `vscode` module is mocked via `__mocks__/vscode.ts` and injected through `vitest.config.ts`'s `resolve.alias`. Do NOT use `vi.mock("vscode")` in individual test files.

### Directory Convention

```
src/__tests__/           Extension tests (Node environment)
webview/__tests__/       WebView tests (jsdom environment)
webview/__tests__/setup.ts  jsdom global setup (injects acquireVsCodeApi)
shared/__tests__/        Shared type tests
__mocks__/vscode.ts      Unified vscode API mock
```

- Test files: `<module-name>.test.ts`, mirroring the source file name
- Structure: AAA (Arrange / Act / Assert), `describe` → `it` two levels
- `it` descriptions: Chinese, format `输入条件 应该 期望结果`

### Commands

```bash
pnpm test            # Run all unit tests once
pnpm test:watch      # Watch mode (during development)
pnpm test:coverage   # Run tests with coverage report (coverage/)
```

### Coverage Thresholds

| Module | Line Coverage ≥ |
|--------|----------------|
| `src/utils/imageService.ts` | 85% |
| `src/utils/getNonce.ts` | 100% |
| `src/MarkdownDocument.ts` | 80% |
| `src/utils/contentTransform.ts` | 90% |
| `src/utils/lineMap.ts` | 90% |
| `webview/utils/slug.ts` | 90% |
| **Overall** | 70% |

### Required Workflow

**Feature development**:
1. Write corresponding unit tests (at least one case each: core logic, boundary values, error paths)
2. Run `pnpm test` — all must pass
3. Run `pnpm build` — must compile cleanly
4. Then `git commit`

**Bug fix**:
1. First add a test that reproduces the bug (in the same commit)
2. Confirm it fails before the fix and passes after
3. Run `pnpm test` — full suite must pass before commit

**Before `git push`**:
- `pnpm test` MUST pass. CI's `unit-test` job runs automatically on every push/PR (`.github/workflows/ci.yml`) and blocks the build on failure.

### Prohibited

- Skipping (`it.skip`) or commenting out failing tests to make CI pass
- Changing test expectations to hide bugs (unless the behavior change is intentional and reviewed)
- Pushing to `main` without running tests

### Mock Conventions

- Call `vi.clearAllMocks()` in `beforeEach` of every `describe` block
- Mock filesystem operations with `vscode.workspace.fs` — never write real files to disk in tests
- Use `vi.useFakeTimers()` / `vi.useRealTimers()` for time-dependent logic — never real `setTimeout` waits
- Never test `private` methods; verify behavior through public API only

## Submitting Changes

1. Fork the repository
2. Create a branch from `dev`: `git checkout -b feature/your-feature`
3. Make changes, write tests, and run `pnpm test` + `pnpm build`
4. Open a Pull Request against the **`dev`** branch

> **Note:** `dev` is the active development branch. `main` is the stable release branch — do not target PRs there.

## Reporting Bugs

Please open a [GitHub Issue](https://github.com/peiyucn/epytor/issues/new) with your VS Code version and relevant logs from the Output panel (`EPYTOR` channel).
