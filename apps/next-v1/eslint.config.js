import tsParser from '@typescript-eslint/parser';
import driftLock from 'eslint-plugin-drift-lock';

export default [
  {
    ignores: ['.next/**', 'node_modules/**'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    ...driftLock.configs.recommended,
  },
];
