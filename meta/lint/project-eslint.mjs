import { createEslintConfig } from './eslint-base.mjs'

const shared = createEslintConfig({
  pureLogicDir: 'shared',
  ignores: ['dist/**', 'coverage/**', 'webview/vendor/**'],
})

export default [
  ...shared,
  {
    files: ['scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      globals: {
        AbortSignal: 'readonly',
        Buffer: 'readonly',
        WebSocket: 'readonly',
        clearTimeout: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
]
