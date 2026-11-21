import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkRepository } from '../scripts/check-policy.mjs'

const BASE_PACKAGE = {
  name: 'fixture',
  version: '1.2.3',
  engines: { vscode: '^1.93.0' },
  contributes: {
    configuration: [
      {
        title: 'epytor',
        properties: {
          'epytor.alpha': { type: 'string' },
          'epytor.beta': { type: 'boolean' },
        },
      },
    ],
  },
  scripts: {
    lint: 'npm run lint:code && npm run lint:policy',
    'lint:code': 'eslint .',
    'lint:policy': 'node scripts/check-policy.mjs',
    verify: 'npm run lint && npm test',
  },
  devDependencies: { '@types/vscode': '1.93.0' },
}

const BASE_FILES: Record<string, string> = {
  'AGENTS.md': '# fixture\n',
  'SECURITY.md': '# security\n',
  'CONTRIBUTING.md': '# contributing\n',
  'CONTRIBUTING.zh-CN.md': '# 参与贡献\n',
  'docs/architecture.md': '# architecture\n',
  'docs/release.md': '# release\n',
  'docs/tech-debt.md': '# debt\n',
  'docs/upstream-limits.md': '# upstream\n',
  'README.md': [
    '# fixture',
    '中文见 [README.zh-CN.md](README.zh-CN.md)',
    '## Settings',
    '| Setting | Default | Description |',
    '|---|---|---|',
    '| epytor.alpha | x | alpha |',
    '| epytor.beta | true | beta |',
    '',
  ].join('\n'),
  'README.zh-CN.md': [
    '# fixture',
    'English: [README.md](README.md)',
    '## 设置',
    '| 设置项 | 默认值 | 说明 |',
    '|---|---|---|',
    '| epytor.alpha | x | alpha |',
    '| epytor.beta | true | beta |',
    '',
  ].join('\n'),
  'CHANGELOG.md': '# Changelog\n\nEnglish: [CHANGELOG.zh-CN.md](CHANGELOG.zh-CN.md)\n\n## [1.2.3] - 2026-01-01\n\n- fixture\n',
  'CHANGELOG.zh-CN.md': '# 更新日志\n\n中文: [CHANGELOG.md](CHANGELOG.md)\n\n## [1.2.3] - 2026-01-01\n\n- fixture\n',
  'meta/rules/engineering.md': [
    '# engineering',
    '',
    '| 项目 | 开发分支 | CI | 发布 | 部署 / 同步 |',
    '|---|---|---|---|---|',
    '| epytor | main | `typecheck` → `test` → `build` → `package` | `publish` (vsce) | — |',
    '',
  ].join('\n'),
  '.github/workflows/ci.yml': [
    'name: ci',
    'on:',
    '  push:',
    '    branches: [main]',
    'jobs:',
    '  typecheck:',
    '    runs-on: ubuntu-latest',
    '  test:',
    '    runs-on: ubuntu-latest',
    '  build:',
    '    runs-on: ubuntu-latest',
    '  package:',
    '    runs-on: ubuntu-latest',
    '',
  ].join('\n'),
  '.github/workflows/publish.yml': [
    'name: Publish',
    'on:',
    '  push:',
    '    tags:',
    "      - 'v*.*.*'",
    'jobs:',
    '  publish:',
    '    runs-on: ubuntu-latest',
    '    environment: marketplace-publish',
    '    steps:',
    '      - run: node scripts/security-gate.mjs',
    '      - run: git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
    '      - run: npm run package',
    '',
  ].join('\n'),
  '.gitignore': 'node_modules/\ndist/\nout/\nreleases/\n*.vsix\ncoverage/\n',
  '.vscodeignore': 'src/**\nwebview/**\ndocs/**\ntest/**\nscripts/**\nmeta/**\nAGENTS.md\nreleases/**\n*.vsix\n',
  'test/example.test.ts': "import { test } from 'vitest'\ntest('ok', () => {})\n",
}

function makeRepo(overrides: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'epytor-policy-'))
  const files: Record<string, string> = {
    ...BASE_FILES,
    'package.json': JSON.stringify(BASE_PACKAGE, null, 2),
    ...overrides,
  }
  for (const [file, content] of Object.entries(files)) {
    const target = join(root, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  return root
}

function violations(overrides: Record<string, string> = {}): string[] {
  const root = makeRepo(overrides)
  try {
    return checkRepository(root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('repository policy', () => {
  it('QG001 删除必读文档 应该 失败', () => {
    const root = makeRepo()
    try {
      rmSync(join(root, 'SECURITY.md'))
      expect(checkRepository(root).some((line) => line.startsWith('QG001'))).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('QG002 配置表键名漂移 应该 失败', () => {
    expect(
      violations({
        'README.md': BASE_FILES['README.md'].replace('| epytor.beta | true | beta |', '| epytor.gamma | true | beta |'),
      }).some((line) => line.startsWith('QG002')),
    ).toBe(true)
  })

  it('QG003 engine 与类型包版本不一致 应该 失败', () => {
    const pkg = { ...BASE_PACKAGE, devDependencies: { '@types/vscode': '1.94.0' } }
    expect(violations({ 'package.json': JSON.stringify(pkg, null, 2) }).some((line) => line.startsWith('QG003'))).toBe(true)
  })

  it('QG004 中文文档失去互链 应该 失败', () => {
    expect(
      violations({ 'README.zh-CN.md': BASE_FILES['README.zh-CN.md'].replace('[README.md](README.md)', '') }).some((line) =>
        line.startsWith('QG004'),
      ),
    ).toBe(true)
  })

  it('QG005 CHANGELOG 缺少当前版本 应该 失败', () => {
    expect(
      violations({ 'CHANGELOG.zh-CN.md': BASE_FILES['CHANGELOG.zh-CN.md'].replace('1.2.3', '1.2.2') }).some((line) =>
        line.startsWith('QG005'),
      ),
    ).toBe(true)
  })

  it('QG006 verify 去掉 lint 应该 失败', () => {
    const pkg = { ...BASE_PACKAGE, scripts: { ...BASE_PACKAGE.scripts, verify: 'npm test' } }
    expect(violations({ 'package.json': JSON.stringify(pkg, null, 2) }).some((line) => line.startsWith('QG006'))).toBe(true)
  })

  it('QG007 CI job 改名或乱序 应该 失败', () => {
    expect(
      violations({ '.github/workflows/ci.yml': BASE_FILES['.github/workflows/ci.yml'].replace('  test:', '  checks:') }).some(
        (line) => line.startsWith('QG007'),
      ),
    ).toBe(true)
  })

  it('QG008 安全门禁移到打包后 应该 失败', () => {
    const publish = [
      'name: Publish',
      'on:',
      '  push:',
      '    tags:',
      "      - 'v*.*.*'",
      'jobs:',
      '  publish:',
      '    runs-on: ubuntu-latest',
      '    environment: marketplace-publish',
      '    steps:',
      '      - run: npm run package',
      '      - run: node scripts/security-gate.mjs',
      '      - run: git merge-base --is-ancestor "$GITHUB_SHA" origin/main',
      '',
    ].join('\n')
    expect(violations({ '.github/workflows/publish.yml': publish }).some((line) => line.startsWith('QG008'))).toBe(true)
  })

  it('QG009 产物进入发布包 应该 失败', () => {
    expect(
      violations({ '.vscodeignore': 'src/**\nwebview/**\ndocs/**\ntest/**\nscripts/**\nmeta/**\nAGENTS.md\nreleases/**\n*.vsix\ndist/**\n' }).some(
        (line) => line.startsWith('QG009'),
      ),
    ).toBe(true)
  })

  it('QG010 提交 .only 应该 失败', () => {
    const focused = 'test' + '.only'
    expect(
      violations({ 'test/example.test.ts': "import { test } from 'vitest'\n" + focused + "('focused', () => {})\n" }).some((line) =>
        line.startsWith('QG010'),
      ),
    ).toBe(true)
  })

  it('干净 fixture 应该 通过全部检查', () => {
    expect(violations()).toEqual([])
  })

  it('真实仓库 应该 通过全部检查', () => {
    expect(checkRepository(process.cwd())).toEqual([])
  })
})
