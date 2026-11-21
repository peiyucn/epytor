import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function hashCommentAt(line) {
  let single = false
  let double = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (double && char === '\\') {
      index += 1
      continue
    }
    if (char === "'" && !double) single = !single
    else if (char === '"' && !single) double = !double
    else if (char === '#' && !single && !double && (index === 0 || /\s/.test(line[index - 1]))) {
      return index
    }
  }
  return -1
}

function read(root, file) {
  return readFileSync(join(root, file), 'utf8').replace(/\r\n/g, '\n')
}

export function checkNoComments(root) {
  const violations = []
  const targets = []
  const skipDirs = new Set(['node_modules', '.git', 'out', 'releases'])

  function walk(dir) {
    if (!existsSync(join(root, dir))) return
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const rel = dir ? join(dir, entry.name) : entry.name
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue
        walk(rel)
      } else if (
        entry.name === 'CODEOWNERS' ||
        entry.name === '.gitignore' ||
        entry.name === '.vscodeignore' ||
        /\.(ya?ml|sh)$/.test(entry.name)
      ) {
        targets.push(rel)
      }
    }
  }

  walk('')
  for (const file of targets) {
    const lines = read(root, file).split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].startsWith('#!')) continue
      if (hashCommentAt(lines[index]) !== -1) {
        violations.push(`L006 ${file}:${index + 1} contains a comment`)
      }
    }
  }
  return violations
}
