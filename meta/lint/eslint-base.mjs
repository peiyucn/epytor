import js from '@eslint/js'
import tseslint from 'typescript-eslint'

const noComments = {
  rules: {
    'no-comments': {
      meta: {
        type: 'problem',
        fixable: 'code',
        schema: [],
        messages: {
          forbidden: 'Comments are forbidden; code is the only source of truth.',
        },
      },
      create(context) {
        return {
          Program() {
            for (const comment of context.sourceCode.getAllComments()) {
              context.report({
                loc: comment.loc,
                messageId: 'forbidden',
                fix: (fixer) => fixer.remove(comment),
              })
            }
          },
        }
      },
    },
  },
}

const shellImportPaths = [
  {
    name: 'node:child_process',
    importNames: ['exec', 'execSync'],
    message: 'Use execFile/spawn with an argument array; never run through a shell.',
  },
  {
    name: 'child_process',
    importNames: ['exec', 'execSync'],
    message: 'Use execFile/spawn with an argument array; never run through a shell.',
  },
]

export function createEslintConfig({ pureLogicDir, ignores = [] } = {}) {
  const pureLogic = pureLogicDir
    ? [
        {
          files: [`${pureLogicDir}/**/*.ts`],
          rules: {
            'no-restricted-imports': [
              'error',
              {
                paths: [
                  {
                    name: 'vscode',
                    message: 'Pure logic modules must not depend on vscode; keep them pure and unit-testable.',
                  },
                  ...shellImportPaths,
                ],
              },
            ],
          },
        },
      ]
    : []

  return tseslint.config(
    {
      linterOptions: { noInlineConfig: true },
    },
    {
      ignores: ['out/**', 'releases/**', 'node_modules/**', 'test-report.xml', ...ignores],
    },
    {
      plugins: { local: noComments },
      rules: {
        'local/no-comments': 'error',
        'no-empty': ['error', { allowEmptyCatch: true }],
      },
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ['scripts/**/*.mjs', 'eslint.config.mjs', 'meta/lint/**/*.mjs'],
      languageOptions: {
        globals: {
          console: 'readonly',
          process: 'readonly',
        },
      },
    },
    {
      files: ['**/*.ts', '**/*.mjs', '**/*.js'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: shellImportPaths,
          },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "CallExpression[callee.name=/^(spawn|spawnSync|execFile|execFileSync|exec|execSync)$/] ObjectExpression > Property[key.name='shell'][value.value=true]",
            message: 'Do not pass shell: true. Use an argument array through execFile/spawn.',
          },
        ],
      },
    },
    {
      files: ['**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'error',
      },
    },
    ...pureLogic,
  )
}

export default createEslintConfig()
