import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkNoComments } from '../meta/lint/check-comments.mjs'

const E24_JOBS = new Set(['typecheck', 'test', 'build', 'package', 'publish', 'deploy', 'sync'])

const REQUIRED_DOCS = [
  'AGENTS.md',
  'README.md',
  'README.zh-CN.md',
  'CHANGELOG.md',
  'CHANGELOG.zh-CN.md',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.zh-CN.md',
  'docs/architecture.md',
  'docs/release.md',
  'docs/tech-debt.md',
  'docs/upstream-limits.md',
]

const GITIGNORE_ENTRIES = ['node_modules/', 'dist/', 'out/', 'releases/', '*.vsix', 'coverage/']
const VSCODEIGNORE_ENTRIES = [
  'src/**',
  'webview/**',
  'docs/**',
  'test/**',
  'scripts/**',
  'meta/**',
  'AGENTS.md',
  'releases/**',
  '*.vsix',
]
const PUBLISH_ENVIRONMENT = 'marketplace-publish'

function read(root, file) {
  return readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n')
}

function exists(root, file) {
  return existsSync(join(root, file))
}

function parseJobs(workflow) {
  const jobsAt = workflow.search(/^jobs:\s*$/m)
  if (jobsAt === -1) return []
  const jobs = []
  for (const line of workflow.slice(jobsAt).split('\n').slice(1)) {
    if (/^\S/.test(line) && !line.startsWith('  ')) break
    const match = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)
    if (match) jobs.push(match[1])
  }
  return jobs
}

function parseSettingsKeys(markdown, heading) {
  const lines = markdown.split('\n')
  const start = lines.findIndex((line) => line.trim() === '## ' + heading)
  if (start === -1) return []
  const keys = []
  let inTable = false
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break
    if (/^\|\s*(Key|Setting|键|设置项)\s*\|/iu.test(line)) {
      inTable = true
      continue
    }
    if (!inTable) continue
    const match = /^\|\s*`?(epytor\.[A-Za-z0-9_.-]+)`?\s*\|/u.exec(line)
    if (match) keys.push(match[1])
  }
  return keys
}

function firstVersion(markdown) {
  const match = /^## \[([^\]]+)\]/m.exec(markdown)
  return match ? match[1] : undefined
}

function registeredPipeline(root) {
  const file = 'meta/rules/engineering.md'
  if (!exists(root, file)) return null
  const line = read(root, file).split('\n').find((entry) => entry.startsWith('| epytor |'))
  if (!line) return null
  const columns = line.split('|').map((column) => column.trim())
  return { ci: columns[3], publish: columns[4], deploy: columns[5] }
}

function stagedJobs(cell) {
  return [...cell.matchAll(/`([^`]+)`/gu)].map((match) => match[1])
}

function walkFiles(dir) {
  if (!existsSync(dir)) return []
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

export function checkRepository(root) {
  const violations = []
  const fail = (id, message) => violations.push(id + ' ' + message)

  for (const file of REQUIRED_DOCS) {
    if (!exists(root, file)) fail('QG001', 'missing required document: ' + file)
  }

  if (!exists(root, 'package.json')) {
    fail('QG001', 'missing package.json')
  } else {
    const pkg = JSON.parse(read(root, 'package.json'))
    const configuration = pkg.contributes?.configuration
    const groups = Array.isArray(configuration) ? configuration : configuration ? [configuration] : []
    const configKeys = groups.flatMap((group) => Object.keys(group.properties ?? {}))

    for (const [file, heading] of [['README.md', 'Settings'], ['README.zh-CN.md', '设置']]) {
      if (!exists(root, file)) continue
      const keys = parseSettingsKeys(read(root, file), heading)
      if (JSON.stringify(keys) !== JSON.stringify(configKeys)) {
        fail('QG002', file + ' settings table does not match package.json configuration order/keys')
      }
    }

    const engines = pkg.engines?.vscode
    const types = pkg.devDependencies?.['@types/vscode']
    if (
      typeof engines !== 'string' ||
      typeof types !== 'string' ||
      !/^\^\d+\.\d+\.\d+$/.test(engines) ||
      !/^\d+\.\d+\.\d+$/.test(types) ||
      engines.slice(1) !== types
    ) {
      fail('QG003', 'engines.vscode (' + engines + ') must use a caret while @types/vscode (' + types + ') stays exact at the same version')
    }

    if (exists(root, 'CHANGELOG.md') && exists(root, 'CHANGELOG.zh-CN.md')) {
      for (const file of ['CHANGELOG.md', 'CHANGELOG.zh-CN.md']) {
        if (firstVersion(read(root, file)) !== pkg.version) {
          fail('QG005', file + ' has no latest entry for package.json version ' + pkg.version)
        }
      }
    }

    const scripts = pkg.scripts ?? {}
    if (typeof scripts.verify !== 'string' || !/^npm run lint(?:\s|$)/u.test(scripts.verify.trim())) {
      fail('QG006', 'package.json scripts.verify must start with "npm run lint"')
    }
    const lint = typeof scripts.lint === 'string' ? scripts.lint : ''
    const codeAt = lint.indexOf('npm run lint:code')
    const policyAt = lint.indexOf('npm run lint:policy')
    if (codeAt === -1 || policyAt === -1 || codeAt > policyAt) {
      fail('QG006', 'package.json scripts.lint must run "npm run lint:code" before "npm run lint:policy"')
    }
  }

  for (const [file, marker] of [['README.md', 'README.zh-CN.md'], ['README.zh-CN.md', 'README.md']]) {
    if (!exists(root, file) || !read(root, file).includes(marker)) {
      fail('QG004', file + ' must link to ' + marker)
    }
  }
  for (const [file, marker] of [
    ['CHANGELOG.md', 'CHANGELOG.zh-CN.md'],
    ['CHANGELOG.zh-CN.md', 'CHANGELOG.md'],
  ]) {
    if (!exists(root, file) || !read(root, file).includes(marker)) {
      fail('QG004', file + ' must link to ' + marker)
    }
  }

  const pipeline = registeredPipeline(root)
  if (pipeline === null) {
    fail('QG007', 'meta/rules/engineering.md has no epytor pipeline row')
  } else {
    const expected = stagedJobs(pipeline.ci)
    const ciPath = '.github/workflows/ci.yml'
    if (!exists(root, ciPath)) {
      fail('QG007', ciPath + ' is missing')
    } else {
      const jobs = parseJobs(read(root, ciPath))
      const unknown = jobs.filter((job) => !E24_JOBS.has(job))
      if (unknown.length > 0) fail('QG007', ciPath + ' has unknown CI job name(s): ' + unknown.join(', '))
      if (new Set(jobs).size !== jobs.length) fail('QG007', ciPath + ' has duplicate job names')
      if (jobs.join(',') !== expected.join(',')) {
        fail('QG007', ciPath + ' jobs must follow the registered pipeline (' + expected.join(' → ') + '); found ' + (jobs.join(' → ') || '(none)'))
      }
    }
    if (pipeline.publish !== '—') {
      const publishJobs = exists(root, '.github/workflows/publish.yml') ? parseJobs(read(root, '.github/workflows/publish.yml')) : null
      if (publishJobs === null || !publishJobs.includes('publish')) {
        fail('QG007', 'registered publish stage must exist in .github/workflows/publish.yml')
      }
    }
  }

  const publishPath = '.github/workflows/publish.yml'
  if (!exists(root, publishPath)) {
    fail('QG008', publishPath + ' is missing')
  } else {
    const publish = read(root, publishPath)
    if (!publish.includes('environment: ' + PUBLISH_ENVIRONMENT)) {
      fail('QG008', 'publish must use the ' + PUBLISH_ENVIRONMENT + ' environment')
    }
    const gate = publish.indexOf('scripts/security-gate.mjs')
    const packageAt = publish.search(/\b(?:vsce package|npm run package|pnpm run package)\b/)
    if (gate === -1 || packageAt === -1 || gate > packageAt) {
      fail('QG008', 'security-alert gate must run before packaging/publishing')
    }
    if (!/git merge-base --is-ancestor.*origin\/main/s.test(publish)) {
      fail('QG008', 'publish must fail closed when the tag commit is not on main')
    }
  }

  for (const [file, entries] of [
    ['.gitignore', GITIGNORE_ENTRIES],
    ['.vscodeignore', VSCODEIGNORE_ENTRIES],
  ]) {
    if (!exists(root, file)) {
      fail('QG009', file + ' is missing')
      continue
    }
    const lines = read(root, file).split('\n')
    for (const entry of entries) {
      if (!lines.includes(entry)) fail('QG009', file + ' must contain ' + entry)
    }
  }
  if (exists(root, '.vscodeignore') && read(root, '.vscodeignore').split('\n').includes('dist/**')) {
    fail('QG009', '.vscodeignore must not exclude dist/** from the extension package')
  }

  for (const dir of ['src/__tests__', 'webview/__tests__', 'shared/__tests__', 'test']) {
    for (const file of walkFiles(join(root, dir))) {
      if (!/\.(test|bench)\.ts$/u.test(file)) continue
      const source = readFileSync(file, 'utf8')
      if (/\.only\s*\(/u.test(source)) {
        fail('QG010', relative(root, file).replaceAll('\\', '/') + ' contains .only(); focused tests must not be committed')
      }
    }
  }

  violations.push(...checkNoComments(root))
  return violations
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(entry).href) {
  const root = process.cwd()
  const violations = checkRepository(root)
  if (violations.length > 0) {
    for (const violation of violations) console.error('✖ ' + violation)
    console.error('\n' + violations.length + ' policy violation(s) under ' + (relative(process.cwd(), root) || '.'))
    process.exit(1)
  }
  console.log('✓ repository policy checks passed')
}
