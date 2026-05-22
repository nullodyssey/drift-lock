import tsParser from '@typescript-eslint/parser';
import driftLock from '@drift-lock/eslint-plugin';

export default [
  {
    files: ['packages/core/src/**/*.ts', 'packages/cli/src/**/*.ts', 'packages/eslint-plugin/src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: 'module',
      },
    },
    plugins: {
      'drift-lock': driftLock,
    },
    rules: {
      ...driftLock.configs.recommended.rules,
    },
  },
];
