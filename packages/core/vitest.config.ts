import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@drift-lock/core': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
    },
  },
  test: {
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['dist/**'],
    },
  },
});
